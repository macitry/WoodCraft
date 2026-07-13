// ============================================================
// WoodCraft — Core Furniture Data Types
// ============================================================

/** A user-adjustable parameter for a furniture template. */
export interface Parameter {
  id: string;
  name: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}

/** A single component within a furniture assembly. */
export interface Component {
  id: string;
  name: string;
  modelUrl: string;
  visible: boolean;
  partType?: string;
  material?: string;
  dimensions?: Record<string, number>;
  /** STL file URL from the backend (if CAD build succeeded). */
  stlUrl?: string;
  /** Absolute world position from URDF tree walk (assembly frame, mm). */
  pose?: PartPose;
  /** Parent link name from URDF joint (null for root/base_link children). */
  jointParent?: string;
}

/** Position + orientation from the backend solver (mm, radians). */
export interface PartPose {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
}

/** Top-level furniture model representing a configured piece. */
export interface FurnitureModel {
  id: string;
  name: string;
  modelUrl: string;
  thumbnail?: string;
  parameters: Parameter[];
  components: Component[];
}

/** A furniture template (before parameterization). */
export interface FurnitureTemplate {
  id: string;
  name: string;
  type: string;
  description?: string;
  thumbnail?: string;
  defaultModelUrl?: string;
  parameters: ParameterTemplate[];
  parts: PartTemplate[];
}

/** Template-level parameter definition (no current value). */
export interface ParameterTemplate {
  id: string;
  name: string;
  defaultValue: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}

/** A part definition within a template. */
export interface PartTemplate {
  name: string;
  partType: string;
  profile: string | null;
  board: string | null;
  material: string;
}

/** Parameters sent to the backend for model generation. */
export interface GenerateModelParams {
  templateId: string;
  width: number;
  depth: number;
  height: number;
  tabletopThickness?: number;
  profile?: string;
  boardMaterial?: string;
  color?: string;
  stlQuality?: string;  // "web" | "standard" | "fine"
}

/** Response from the backend model generation endpoint. */
export interface GenerateModelResponse {
  model_id: string;
  name: string;
  status: 'full' | 'partial' | 'solver_only' | 'warming';
  parts: ApiPartInfo[];
  dimensions: Record<string, number>;
  stl_url?: string | null;
  urdf_url?: string | null;
  joints: JointInfo[];
  message?: string | null;
}

/** Joint info from URDF assembly structure. */
export interface JointInfo {
  name: string;
  parent: string;
  child: string;
  origin: PartPose;
}

/** Part info from the backend API response. */
export interface ApiPartInfo {
  name: string;
  part_type: string;
  profile?: string | null;
  board?: string | null;
  material: string;
  dimensions?: Record<string, number> | null;
  mass_kg?: number | null;
  stl_url?: string | null;
  step_url?: string | null;
  pose?: PartPose | null;
  joint_parent?: string | null;
}

/** BOM (Bill of Materials) entry. */
export interface BomEntry {
  name: string;
  partType: string;
  quantity: number;
  material: string;
  dimensions?: Record<string, number>;
  massKg?: number;
}

/** BOM response from the backend. */
export interface BomResponse {
  furnitureName: string;
  entries: BomEntry[];
  totalMassKg?: number;
}

/** Drawing / blueprint metadata. */
export interface DrawingInfo {
  id: string;
  name: string;
  type: 'part' | 'assembly' | 'installation';
  url: string;
  format: 'pdf' | 'svg' | 'png';
}

/** Drawing list response. */
export interface DrawingListResponse {
  furnitureName: string;
  drawings: DrawingInfo[];
}

/** Camera viewpoint preset. */
export type ViewPreset = 'front' | 'top' | 'side' | 'perspective';

/** Material information. */
export interface MaterialInfo {
  id: string;
  name: string;
  category: string;
  density?: number;
  color?: string;
  textureUrl?: string;
}

/** Future: motion support for movable furniture structures. */
export interface Motion {
  type: 'linear' | 'rotation';
  target: string;
  axis?: [number, number, number];
  range?: [number, number];
}
