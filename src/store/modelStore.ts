import { create } from 'zustand';
import * as THREE from 'three';
import type {
  FurnitureModel,
  Parameter,
  Component,
  GenerateModelResponse,
  TabletopHole,
  BracketInstance,
  MateState,
  MateHit,
} from '../types/furniture';
import { TEMPLATE_BACKEND_ID, TEMPLATE_LAYOUTS } from '../types/furniture';
import type { DxfTabletopShape } from '../utils/dxfImport';
import { generateModel, fetchDefaultModel, fetchProgress } from '../api/modelApi';
import type { ServerProgress } from '../api/modelApi';
import { mockModel, delay } from '../mock/exampleModel';
import { autoGenerateBrackets } from '../diy/mainBracketAuto';

// ============================================================
// Model Store — manages the current furniture model state
// ============================================================

/** Base URL for the backend API (for STL files, etc.). */
const API_BASE = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

/** Convert API response to Component array. */
function apiPartsToComponents(response: GenerateModelResponse): Component[] {
  return response.parts.map((p) => ({
    id: p.name,
    name: formatPartName(p.name),
    modelUrl: '',
    visible: true,
    partType: p.part_type,
    material: p.material,
    dimensions: p.dimensions ?? undefined,
    stlUrl: p.stl_url ? `${API_BASE}${p.stl_url}` : undefined,
    pose: p.pose ?? undefined,
    jointParent: p.joint_parent ?? undefined,
  }));
}

/** Convert API params to the store Parameter format. */
function dimensionsToParameters(
  dimensions: Record<string, number>,
): Parameter[] {
  const paramDefs: Record<string, { name: string; min: number; max: number; step: number; unit: string }> = {
    width: { name: '桌面宽度', min: 600, max: 3000, step: 10, unit: 'mm' },
    depth: { name: '桌面深度', min: 400, max: 1200, step: 10, unit: 'mm' },
    height: { name: '桌面高度', min: 500, max: 1300, step: 10, unit: 'mm' },
    tabletop_thickness: { name: '桌板厚度', min: 12, max: 40, step: 1, unit: 'mm' },
  };

  return Object.entries(dimensions)
    .filter(([key]) => key in paramDefs)
    .map(([key, value]) => {
      const def = paramDefs[key];
      return {
        id: key,
        name: def.name,
        value,
        unit: def.unit,
        min: def.min,
        max: def.max,
        step: def.step,
      };
    });
}

/** Convert snake_case part names to Chinese display names. */
function formatPartName(name: string): string {
  const map: Record<string, string> = {
    tabletop: '桌面',
    leg_front_left: '左前腿',
    leg_front_right: '右前腿',
    leg_back_left: '左后腿',
    leg_back_right: '右后腿',
    beam_front: '前横梁',
    beam_back: '后横梁',
    beam_left: '左横梁',
    beam_right: '右横梁',
    cross_beam_front: '前加强横梁',
    cross_beam_back: '后加强横梁',
    cross_beam_left: '左加强横梁',
    cross_beam_right: '右加强横梁',
    bracket_corner_fl: '角铁-前左角',
    bracket_corner_fr: '角铁-前右角',
    bracket_corner_bl: '角铁-后左角',
    bracket_corner_br: '角铁-后右角',
    bracket_leg_fl_front: '角铁-左前腿-前',
    bracket_leg_fl_left: '角铁-左前腿-左',
    bracket_leg_fr_front: '角铁-右前腿-前',
    bracket_leg_fr_right: '角铁-右前腿-右',
    bracket_leg_bl_back: '角铁-左后腿-后',
    bracket_leg_bl_left: '角铁-左后腿-左',
    bracket_leg_br_back: '角铁-右后腿-后',
    bracket_leg_br_right: '角铁-右后腿-右',
  };
  return map[name] || name;
}

/** Inject cross-beam + bracket virtual components based on template config. */
export function injectVirtualComponents(components: Component[], templateId: string): Component[] {
  const cfg = TEMPLATE_LAYOUTS[templateId];
  if (!cfg) return components;

  // Strip old virtual components
  let filtered = components.filter((c) =>
    !c.id.startsWith('cross_beam') && !c.id.startsWith('bracket_'),
  );

  // --- Cross beams ---
  if (cfg.hasCrossBeams) {
    const isFrontBack = cfg.crossBeamOrientation === 'front_back';
    const refBeam = filtered.find((c) => isFrontBack ? c.id === 'beam_front' : c.id === 'beam_left');
    const beamStlUrl = refBeam?.stlUrl;
    const refDims = refBeam?.dimensions ?? { extrusion_length: 1080 };
    const pose = isFrontBack
      ? { x: 0, y: 0, z: 0, roll: 0, pitch: -Math.PI / 2, yaw: 0 }
      : { x: 0, y: 0, z: 0, roll: -Math.PI / 2, pitch: 0, yaw: 0 };
    const ids = isFrontBack
      ? ['cross_beam_front', 'cross_beam_back']
      : ['cross_beam_left', 'cross_beam_right'];
    for (const id of ids) {
      filtered.push({
        id, name: formatPartName(id), modelUrl: '', visible: true,
        partType: 'cross_beam', material: 'aluminum', dimensions: refDims,
        stlUrl: beamStlUrl, pose,
      });
    }
  }

  // Corner brackets are now user-editable via BracketEditor (store.brackets[]).
  // No longer injected as faux Components.

  return filtered;
}

interface ModelState {
  model: FurnitureModel | null;
  isLoading: boolean;
  error: string | null;
  selectedComponentId: string | null;
  /** Server warmup/generation progress for progress bar. */
  progress: ServerProgress | null;

  // Current generation params (for regeneration on param change)
  currentParams: {
    templateId: string;
    width: number;
    depth: number;
    height: number;
    tabletopThickness: number;
    profile: string;
    boardMaterial: string;
    /** Frontend-only: width inset ratio (0–0.5). */
    insetRatioX: number;
    /** Frontend-only: depth inset ratio (0–0.5). */
    insetRatioZ: number;
    /** Frontend-only: cross-beam height ratio (0=ground, 1=leg top). */
    crossBeamHeightRatio: number;
  };

  // DXF-imported tabletop shape (null = use default rectangle)
  dxfTabletop: DxfTabletopShape | null;

  /** Saved visibility state for solo restore. */
  _preSoloVisibility: Record<string, boolean> | null;

  // Hole editing (shared between Plan view and 3D view)
  holes: TabletopHole[];
  selectedHoleId: string | null;

  // Bracket editing — user-defined corner bracket placements
  brackets: BracketInstance[];
  selectedBracketId: string | null;
  defaultBracketCount: number; // how many were auto-generated (locked)
  placementMode: boolean; // when true, clicking 3D view places bracket at hit point

  // Mate (SolidWorks-style assembly)
  mateState: MateState;
  /** ID of the bracket being mated. */
  mateBracketId: string | null;
  /** Source face hit data (on the bracket). */
  mateSourceHit: MateHit | null;
  /** Target face hit data (on the target part). */
  mateTargetHit: MateHit | null;

  // Actions
  loadMockModel: () => Promise<void>;
  loadModelFromApi: () => Promise<void>;
  updateParameter: (parameterId: string, value: number) => Promise<void>;
  /** Update a frontend-only layout param (no API call). */
  updateLayoutParam: (key: string, value: number) => void;
  selectComponent: (componentId: string | null) => void;
  setComponentVisibility: (componentId: string, visible: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  // Hole actions
  addHole: (hole: TabletopHole) => void;
  updateHole: (id: string, patch: Partial<TabletopHole>) => void;
  removeHole: (id: string) => void;
  selectHole: (id: string | null) => void;
  setHoles: (holes: TabletopHole[]) => void;
  setDxfTabletop: (shape: DxfTabletopShape | null) => void;
  /** Toggle solo: hide all other parts, show only this one. */
  soloComponent: (componentId: string) => void;
  // Bracket actions
  addBracket: (bracket: BracketInstance) => void;
  updateBracket: (id: string, patch: Partial<BracketInstance>) => void;
  removeBracket: (id: string) => void;
  selectBracket: (id: string | null) => void;
  togglePlacementMode: () => void;
  // Mate actions
  startMate: (bracketId: string) => void;
  cancelMate: () => void;
  setMateSourceHit: (hit: MateHit) => void;
  setMateTargetHit: (hit: MateHit) => void;
  applyMate: () => void;
  /** Reset brackets to default auto-generated set. */
  resetBracketsToDefault: () => void;
  /** Replace all brackets (e.g. when switching templates). */
  setBrackets: (brackets: BracketInstance[]) => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  model: null,
  isLoading: false,
  error: null,
  selectedComponentId: null,
  progress: null,
  brackets: [],
  selectedBracketId: null,
  defaultBracketCount: 0,
  placementMode: false,
  currentParams: {
    templateId: 'basic-desk',
    width: 1200,
    depth: 600,
    height: 750,
    tabletopThickness: 18,
    profile: '3030',
    boardMaterial: 'plywood',
    insetRatioX: 0,
    insetRatioZ: 0,
    crossBeamHeightRatio: 0.5,
  },

  loadMockModel: async () => {
    set({ isLoading: true, error: null });
    try {
      await delay(400);
      set({ model: { ...mockModel }, isLoading: false });
    } catch {
      set({ error: 'Failed to load mock model', isLoading: false });
    }
  },

  loadModelFromApi: async () => {
    set({ isLoading: true, error: null, progress: null });

    // Start polling server progress
    const progressTimer = setInterval(async () => {
      try {
        const p = await fetchProgress();
        useModelStore.setState({ progress: p });
      } catch { /* ignore */ }
    }, 500);

    console.log('[WoodCraft] Fetching default model...');

    try {
      const response: GenerateModelResponse = await fetchDefaultModel();

      clearInterval(progressTimer);
      console.log('[WoodCraft] Status:', response.status,
        'STLs:', response.parts.filter((p) => p.stl_url).length);

      const components = injectVirtualComponents(
        apiPartsToComponents(response),
        get().currentParams.templateId,
      );
      const model: FurnitureModel = {
        id: response.model_id,
        name: response.name,
        modelUrl: '',
        parameters: dimensionsToParameters(response.dimensions),
        components,
      };

      // Auto-place brackets at reasonable joints (reuses the DIY corner logic)
      const defaultBrackets = autoGenerateBrackets(model, get().currentParams);

      set({
        model,
        isLoading: false,
        error: null,
        progress: null,
        brackets: defaultBrackets,
        defaultBracketCount: defaultBrackets.length,
        selectedBracketId: null,
      });

      if (response.status === 'warming') {
        console.log('[WoodCraft] Warmup in progress — polling for STL...');
        pollForStl();
      } else if (response.message) {
        console.warn('[WoodCraft]', response.message);
      }
    } catch (err) {
      clearInterval(progressTimer);
      console.error('[WoodCraft] API failed:', err);
      try {
        await delay(300);
        set({ model: { ...mockModel }, isLoading: false, progress: null });
      } catch {
        set({ error: 'Failed to load model', isLoading: false, progress: null });
      }
    }
  },

  updateParameter: async (parameterId: string, value: number) => {
    const { model } = get();
    if (!model) return;

    // 1. Instant: update model parameters + currentParams → layout re-positions instantly
    const updatedModelParams: Parameter[] = model.parameters.map((p) =>
      p.id === parameterId ? { ...p, value } : p,
    );
    const newParams = { ...get().currentParams };
    const curKey = paramToCurrentKey(parameterId);
    if (curKey in newParams) {
      (newParams as Record<string, unknown>)[curKey] = value;
    }
    set({
      model: { ...model, parameters: updatedModelParams },
      currentParams: newParams,
    });

    // Frame geometry changed — re-anchor the auto brackets to the new joints so
    // they follow the table as it is resized.
    if (GEOMETRY_PARAMS.has(curKey)) regenerateBracketsForCurrent();

    // 2. Debounced background regeneration (only fires after 2s of inactivity)
    const backendId = TEMPLATE_BACKEND_ID[newParams.templateId] || 'basic-desk';
    const key = 'regen_timer';
    if ((window as Record<string, unknown>)[key]) {
      clearTimeout((window as Record<string, number>)[key]);
    }
    (window as Record<string, unknown>)[key] = setTimeout(() => {
      generateModel({
        templateId: backendId,
        width: newParams.width,
        depth: newParams.depth,
        height: newParams.height,
        tabletopThickness: newParams.tabletopThickness,
        profile: newParams.profile,
        boardMaterial: newParams.boardMaterial,
        stlQuality: 'web',
      })
        .then((response) => {
          if (response.status === 'full') {
            const updatedModel: FurnitureModel = {
              ...get().model!,
              id: response.model_id,
              parameters: dimensionsToParameters(response.dimensions),
              components: injectVirtualComponents(
                apiPartsToComponents(response),
                get().currentParams.templateId,
              ),
            };
            set({ model: updatedModel });
          }
        })
        .catch((err) => {
          console.error('[WoodCraft] Background regeneration failed:', err);
        });
    }, 2000);
  },

  selectComponent: (componentId: string | null) => {
    set({ selectedComponentId: componentId });
  },

  setComponentVisibility: (componentId: string, visible: boolean) => {
    const { model } = get();
    if (!model) return;

    const updatedComponents: Component[] = model.components.map((c) =>
      c.id === componentId ? { ...c, visible } : c,
    );
    set({ model: { ...model, components: updatedComponents } });
  },

  // Internal: stores pre-solo visibility state for restore
  _preSoloVisibility: null as Record<string, boolean> | null,

  soloComponent: (componentId: string) => {
    const { model, _preSoloVisibility } = get();
    if (!model) return;

    // If already solo'd this part, restore all
    if (_preSoloVisibility) {
      const restored = model.components.map((c) => ({
        ...c, visible: _preSoloVisibility[c.id] ?? true,
      }));
      set({ model: { ...model, components: restored }, _preSoloVisibility: null });
      return;
    }

    // Save current visibility and solo this part
    const saved: Record<string, boolean> = {};
    const updated = model.components.map((c) => {
      saved[c.id] = c.visible;
      return { ...c, visible: c.id === componentId };
    });
    set({ model: { ...model, components: updated }, _preSoloVisibility: saved });
  },

  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),

  updateLayoutParam: (key: string, value: number) => {
    set((s) => ({
      currentParams: { ...s.currentParams, [key]: value },
    }));
    // Inset / cross-beam-height changes move the frame too — brackets follow.
    if (GEOMETRY_PARAMS.has(key)) regenerateBracketsForCurrent();
  },

  // ---- DXF tabletop ----
  dxfTabletop: null,

  // ---- Hole editing state (shared) ----
  holes: [],
  selectedHoleId: null,

  addHole: (hole: TabletopHole) =>
    set((s) => ({ holes: [...s.holes, hole], selectedHoleId: hole.id })),

  updateHole: (id: string, patch: Partial<TabletopHole>) =>
    set((s) => ({
      holes: s.holes.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    })),

  removeHole: (id: string) =>
    set((s) => ({
      holes: s.holes.filter((h) => h.id !== id),
      selectedHoleId: s.selectedHoleId === id ? null : s.selectedHoleId,
    })),

  selectHole: (id: string | null) => set({ selectedHoleId: id }),

  setHoles: (holes: TabletopHole[]) => set({ holes }),

  setDxfTabletop: (shape: DxfTabletopShape | null) => {
    set({ dxfTabletop: shape });
    if (shape) {
      set((s) => ({
        currentParams: {
          ...s.currentParams,
          width: Math.round(shape.bounds.width),
          depth: Math.round(shape.bounds.depth),
        },
      }));
      regenerateBracketsForCurrent();
    }
  },

  // ---- Bracket editing ----
  addBracket: (bracket: BracketInstance) =>
    set((s) => ({ brackets: [...s.brackets, bracket], selectedBracketId: bracket.id })),

  updateBracket: (id: string, patch: Partial<BracketInstance>) =>
    set((s) => ({
      brackets: s.brackets.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),

  removeBracket: (id: string) =>
    set((s) => ({
      brackets: s.brackets.filter((b) => b.id !== id),
      selectedBracketId: s.selectedBracketId === id ? null : s.selectedBracketId,
    })),

  selectBracket: (id: string | null) => set({ selectedBracketId: id }),

  togglePlacementMode: () => set((s) => ({ placementMode: !s.placementMode })),

  // ---- Mate workflow ----
  mateState: 'idle',
  mateBracketId: null,
  mateSourceHit: null,
  mateTargetHit: null,

  startMate: (bracketId: string) =>
    set({ mateState: 'selecting_source_face', mateBracketId: bracketId, mateSourceHit: null, mateTargetHit: null, placementMode: false }),

  cancelMate: () =>
    set({ mateState: 'idle', mateBracketId: null, mateSourceHit: null, mateTargetHit: null }),

  setMateSourceHit: (hit: MateHit) => {
    const { mateState } = get();
    if (mateState === 'selecting_source_face') {
      set({ mateSourceHit: hit, mateState: 'selecting_target_face' });
    }
  },

  setMateTargetHit: (hit: MateHit) => {
    const { mateState } = get();
    if (mateState === 'selecting_target_face') {
      set({ mateTargetHit: hit });
      // Auto-apply the mate
      get().applyMate();
    }
  },

  applyMate: () => {
    const { mateBracketId, mateSourceHit, mateTargetHit, brackets } = get();
    if (!mateBracketId || !mateSourceHit || !mateTargetHit) return;

    const bracket = brackets.find((b) => b.id === mateBracketId);
    if (!bracket) return;

    // --- Math ---
    // All positions are in mm, normals are unit vectors.
    const Ps = new Float64Array(mateSourceHit.point);   // source hit (on bracket, world meters)
    const Ns = new Float64Array(mateSourceHit.normal);   // source normal
    const Pt = new Float64Array(mateTargetHit.point);    // target hit (on part, world meters)
    const Nt = new Float64Array(mateTargetHit.normal);   // target normal

    // Source to world-mm
    const Ps_x = Ps[0] * 1000, Ps_y = Ps[1] * 1000, Ps_z = Ps[2] * 1000;
    const Pt_x = Pt[0] * 1000, Pt_y = Pt[1] * 1000, Pt_z = Pt[2] * 1000;

    // Current bracket transform (mm, degrees → quaternion)
    const br = THREE.MathUtils.degToRad(bracket.rotation.roll);
    const bp = THREE.MathUtils.degToRad(bracket.rotation.pitch);
    const by_ = THREE.MathUtils.degToRad(bracket.rotation.yaw);
    const R_old = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(br, bp, by_, 'ZYX'),
    );
    const P_old = new THREE.Vector3(bracket.position.x, bracket.position.y, bracket.position.z);

    // P_s in bracket local frame
    const Ps_world = new THREE.Vector3(Ps_x, Ps_y, Ps_z);
    const Ps_local = Ps_world.clone().sub(P_old).applyQuaternion(R_old.clone().invert());

    // Rotation: align Ns → -Nt (faces mate)
    const Ns_vec = new THREE.Vector3(Ns[0], Ns[1], Ns[2]);
    const Nt_vec = new THREE.Vector3(Nt[0], Nt[1], Nt[2]);
    const targetNormal = Nt_vec.clone().negate(); // mate faces opposite

    const R_delta = new THREE.Quaternion().setFromUnitVectors(Ns_vec, targetNormal);
    const R_new = R_delta.clone().multiply(R_old);

    // Position: after rotation, Ps_local transforms to Ps_new_world = R_new * Ps_local + P_new
    // We want Ps_new_world = Pt_world
    const Pt_world = new THREE.Vector3(Pt_x, Pt_y, Pt_z);
    const Ps_local_rotated = Ps_local.clone().applyQuaternion(R_new);
    const P_new = Pt_world.clone().sub(Ps_local_rotated);

    // Convert rotation back to Euler (degrees, ZYX)
    const newEuler = new THREE.Euler().setFromQuaternion(R_new, 'ZYX');
    const newRoll = Math.round(THREE.MathUtils.radToDeg(newEuler.x));
    const newPitch = Math.round(THREE.MathUtils.radToDeg(newEuler.y));
    const newYaw = Math.round(THREE.MathUtils.radToDeg(newEuler.z));

    // Update bracket
    const updated: BracketInstance = {
      ...bracket,
      position: { x: Math.round(P_new.x), y: Math.round(P_new.y), z: Math.round(P_new.z) },
      rotation: { roll: newRoll, pitch: newPitch, yaw: newYaw },
      connectedParts: [...new Set([...bracket.connectedParts, mateTargetHit.objectName])],
    };

    set((s) => ({
      brackets: s.brackets.map((b) => (b.id === mateBracketId ? updated : b)),
      selectedBracketId: mateBracketId,
      mateState: 'idle',
      mateBracketId: null,
      mateSourceHit: null,
      mateTargetHit: null,
    }));

    console.log('[Mate] Applied:', {
      bracket: bracket.name,
      oldPos: bracket.position,
      newPos: updated.position,
      oldRot: bracket.rotation,
      newRot: updated.rotation,
      target: mateTargetHit.objectName,
    });
  },

  resetBracketsToDefault: () => {
    const { model, currentParams } = get();
    const defaults = autoGenerateBrackets(model, currentParams);
    set({ brackets: defaults, defaultBracketCount: defaults.length, selectedBracketId: null });
  },

  setBrackets: (brackets: BracketInstance[]) =>
    set({ brackets, defaultBracketCount: brackets.length }),
}));

// ============================================================
// Bracket re-anchoring on geometry change
// ============================================================

/** currentParams keys that move the aluminum frame (and thus bracket joints). */
const GEOMETRY_PARAMS = new Set([
  'width', 'depth', 'height', 'tabletopThickness',
  'insetRatioX', 'insetRatioZ', 'crossBeamHeightRatio',
]);

/** Map a model-parameter id to the matching currentParams key. */
const paramToCurrentKey = (id: string): string =>
  id === 'tabletop_thickness' ? 'tabletopThickness' : id;

const bracketPairKey = (parts: string[]) => [...parts].sort().join('|');

const bracketPosDist = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Recompute the auto brackets against the current params so they follow the
 * frame when the table is resized / re-templated. Manual brackets
 * (bracket_user_*) are kept verbatim; per-bracket STL override and enabled
 * state are carried onto the regenerated auto brackets by matching joint
 * (same connected parts, nearest old position).
 */
function regenerateBracketsForCurrent() {
  const s = useModelStore.getState();
  const { model, currentParams } = s;
  if (!model) return;
  const fresh = autoGenerateBrackets(model, currentParams);
  const oldAuto = s.brackets.filter((b) => b.id.startsWith('bracket_auto_'));
  const manual = s.brackets.filter((b) => !b.id.startsWith('bracket_auto_'));
  const matched = fresh.map((fb) => {
    const fk = bracketPairKey(fb.connectedParts);
    const candidates = oldAuto.filter((ob) => bracketPairKey(ob.connectedParts) === fk);
    if (candidates.length === 0) return fb;
    const near = candidates.reduce((best, c) =>
      bracketPosDist(c.position, fb.position) < bracketPosDist(best.position, fb.position) ? c : best,
    );
    return { ...fb, stlUrl: near.stlUrl, enabled: near.enabled };
  });
  const all = [...matched, ...manual];
  useModelStore.setState((st) => ({
    brackets: all,
    defaultBracketCount: fresh.length,
    selectedBracketId:
      st.selectedBracketId && all.some((b) => b.id === st.selectedBracketId)
        ? st.selectedBracketId
        : null,
  }));
}

// ============================================================
// STL Polling — retry until warmup completes
// ============================================================

async function pollForStl(attempt: number = 1) {
  if (attempt > 30) {
    console.warn('[WoodCraft] STL polling gave up after 30 attempts');
    return;
  }

  console.log(`[WoodCraft] Polling for STL (attempt ${attempt})...`);
  await delay(3000);

  try {
    const response = await fetchDefaultModel();
    if (response.status !== 'warming') {
      console.log('[WoodCraft] STL ready! Swapping model.');
      const components = injectVirtualComponents(
        apiPartsToComponents(response),
        useModelStore.getState().currentParams.templateId,
      );
      const { model } = useModelStore.getState();
      if (model) {
        useModelStore.setState({
          model: { ...model, id: response.model_id, components },
        });
      }
      return;
    }
  } catch {
    // Server not ready yet, retry
  }

  pollForStl(attempt + 1);
}

// ============================================================
// Parameter Store — tracks parameter editing state
// ============================================================

interface ParameterState {
  dirtyParameters: Record<string, number>;
  hasUnsavedChanges: boolean;

  setDirtyParameter: (id: string, value: number) => void;
  clearDirtyParameters: () => void;
}

export const useParameterStore = create<ParameterState>((set) => ({
  dirtyParameters: {},
  hasUnsavedChanges: false,

  setDirtyParameter: (id: string, value: number) => {
    set((state) => {
      const dirty = { ...state.dirtyParameters, [id]: value };
      return { dirtyParameters: dirty, hasUnsavedChanges: true };
    });
  },

  clearDirtyParameters: () => {
    set({ dirtyParameters: {}, hasUnsavedChanges: false });
  },
}));
