import client from '../api/client';

/**
 * The wire layer, and the reason it is a separate file.
 *
 * `src/api/templateApi.ts` and `src/api/bomApi.ts` already declare these two
 * responses — but in camelCase (`parameters[].defaultValue`, `entry.partType`,
 * `totalMassKg`), while the server actually sends snake_case (`default_value`,
 * `part_type`, `total_mass_kg`). `axios.get<T>` is typed but not converted, so
 * those two modules would hand back `undefined` for every field they declare
 * and nothing would fail until a slider rendered empty. They have no callers,
 * which is how the mismatch survived.
 *
 * Rather than correct shared types and risk the rest of the app, this file
 * takes the shape the server really has and normalises it once, at the one
 * boundary where the two spellings meet. Everything under `src/shop/` then
 * reads camelCase and never has to know.
 *
 * The server: `Parametric-Furniture-Generator/server.py`.
 */

const API_BASE: string = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

/** The server hands back paths like `/static/models/...`; they are served off
 *  the same origin as the API, which is not the page's origin in dev. */
export function assetUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_BASE}${path}`;
}

// --- what the server says ---------------------------------------------------

interface WireParam {
  id: string;
  name: string;
  default_value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}

interface WireTemplate {
  id: string;
  name: string;
  type: string;
  description?: string;
  parameters: WireParam[];
  parts?: unknown[];
}

interface WirePose {
  x?: number;
  y?: number;
  z?: number;
  roll?: number;
  pitch?: number;
  yaw?: number;
}

interface WirePart {
  name: string;
  part_type: string;
  material?: string;
  dimensions?: Record<string, number> | null;
  mass_kg?: number | null;
  stl_url?: string | null;
  pose?: WirePose | null;
}

interface WireGenerate {
  model_id: string;
  name: string;
  status: string;
  parts: WirePart[];
  dimensions?: Record<string, number> | null;
  message?: string | null;
}

interface WireBomEntry {
  name: string;
  part_type: string;
  quantity: number;
  material: string;
  dimensions?: Record<string, number> | null;
  mass_kg?: number | null;
}

interface WireBom {
  furniture_name: string;
  entries: WireBomEntry[];
  total_mass_kg?: number | null;
}

// --- what the page speaks ---------------------------------------------------

/** One adjustable dimension, with the limits the server sets for it. */
export interface ShopParam {
  id: string;
  name: string;
  defaultValue: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export interface ShopTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  parameters: ShopParam[];
  partCount: number;
}

/** Where a part sits, in the server's own millimetres and Euler angles. */
export interface ShopPose {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export interface ShopPart {
  name: string;
  partType: string;
  material: string;
  dimensions: Record<string, number> | null;
  massKg: number | null;
  /** Absolute URL, or null while the build is still running. */
  stlUrl: string | null;
  pose: ShopPose | null;
}

export interface ShopModel {
  modelId: string;
  name: string;
  /** `"warming"` while the CAD build runs in the background, then `"full"`. */
  status: string;
  parts: ShopPart[];
  /** Overall width/depth/height in mm — what the camera frames. */
  dimensions: Record<string, number> | null;
  message: string | null;
}

export interface ShopBomEntry {
  name: string;
  partType: string;
  quantity: number;
  material: string;
  dimensions: Record<string, number> | null;
  massKg: number | null;
}

export interface ShopBom {
  furnitureName: string;
  entries: ShopBomEntry[];
  totalMassKg: number | null;
}

export interface ShopProgress {
  phase: string;
  message: string;
  current: number;
  total: number;
  part: string;
}

/** Exactly the body `POST /api/models/generate` accepts. */
export interface ShopGenerateParams {
  templateId: string;
  width: number;
  depth: number;
  height: number;
  tabletopThickness: number;
  profile: string;
}

// --- the two conversion helpers --------------------------------------------

function toPart(p: WirePart): ShopPart {
  return {
    name: p.name,
    partType: p.part_type,
    material: p.material ?? '',
    dimensions: p.dimensions ?? null,
    massKg: p.mass_kg ?? null,
    stlUrl: p.stl_url ? assetUrl(p.stl_url) : null,
    pose: p.pose
      ? {
          x: p.pose.x ?? 0,
          y: p.pose.y ?? 0,
          z: p.pose.z ?? 0,
          roll: p.pose.roll ?? 0,
          pitch: p.pose.pitch ?? 0,
          yaw: p.pose.yaw ?? 0,
        }
      : null,
  };
}

function toBomEntry(e: WireBomEntry): ShopBomEntry {
  return {
    name: e.name,
    partType: e.part_type,
    quantity: e.quantity,
    material: e.material,
    dimensions: e.dimensions ?? null,
    massKg: e.mass_kg ?? null,
  };
}

// --- the calls --------------------------------------------------------------

export async function fetchShopTemplates(): Promise<ShopTemplate[]> {
  const { data } = await client.get<WireTemplate[]>('/api/templates');
  return data.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    description: t.description ?? '',
    parameters: (t.parameters ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      defaultValue: p.default_value,
      unit: p.unit,
      min: p.min,
      max: p.max,
      step: p.step,
    })),
    partCount: t.parts?.length ?? 0,
  }));
}

/**
 * Ask for a model. Returns as soon as the server answers, which on a cache miss
 * is immediately and with `status: "warming"` — the CAD build carries on in a
 * background thread and this same call, with the same dimensions, is what
 * eventually reports `status: "full"`. The cache key is the dimensions
 * themselves, so polling is just asking again.
 */
export async function generateShopModel(params: ShopGenerateParams): Promise<ShopModel> {
  const { data } = await client.post<WireGenerate>('/api/models/generate', {
    template_id: params.templateId,
    width: params.width,
    depth: params.depth,
    height: params.height,
    tabletop_thickness: params.tabletopThickness,
    profile: params.profile,
    stl_quality: 'web',
  });
  return {
    modelId: data.model_id,
    name: data.name,
    status: data.status,
    parts: (data.parts ?? []).map(toPart),
    dimensions: data.dimensions ?? null,
    message: data.message ?? null,
  };
}

export async function fetchShopBom(modelId: string): Promise<ShopBom> {
  const { data } = await client.get<WireBom>(`/api/models/${modelId}/bom`);
  return {
    furnitureName: data.furniture_name,
    entries: (data.entries ?? []).map(toBomEntry),
    totalMassKg: data.total_mass_kg ?? null,
  };
}

/** The server's own progress. It is one global value for the whole process, not
 *  a per-request one, so it is a hint rather than a status for THIS build. */
export async function fetchShopProgress(): Promise<ShopProgress> {
  const { data } = await client.get<ShopProgress>('/api/progress');
  return data;
}
