import { create } from 'zustand';
import type {
  FurnitureModel,
  Parameter,
  Component,
  GenerateModelResponse,
} from '../types/furniture';
import { generateModel, fetchDefaultModel } from '../api/modelApi';
import { mockModel, delay } from '../mock/exampleModel';

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
  };
  return map[name] || name;
}

interface ModelState {
  model: FurnitureModel | null;
  isLoading: boolean;
  error: string | null;
  selectedComponentId: string | null;

  // Current generation params (for regeneration on param change)
  currentParams: {
    templateId: string;
    width: number;
    depth: number;
    height: number;
    tabletopThickness: number;
    profile: string;
    boardMaterial: string;
  };

  // Actions
  loadMockModel: () => Promise<void>;
  loadModelFromApi: () => Promise<void>;
  updateParameter: (parameterId: string, value: number) => Promise<void>;
  selectComponent: (componentId: string | null) => void;
  setComponentVisibility: (componentId: string, visible: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  model: null,
  isLoading: false,
  error: null,
  selectedComponentId: null,
  currentParams: {
    templateId: 'basic-desk',
    width: 1200,
    depth: 600,
    height: 750,
    tabletopThickness: 18,
    profile: '3030',
    boardMaterial: 'plywood',
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
    set({ isLoading: true, error: null });

    console.log('[WoodCraft] Fetching default model...');

    try {
      const response: GenerateModelResponse = await fetchDefaultModel();

      console.log('[WoodCraft] Status:', response.status,
        'STLs:', response.parts.filter((p) => p.stl_url).length);

      const components = apiPartsToComponents(response);
      const model: FurnitureModel = {
        id: response.model_id,
        name: response.name,
        modelUrl: '',
        parameters: dimensionsToParameters(response.dimensions),
        components,
      };

      set({ model, isLoading: false, error: null });

      // If still warming, poll until STL files are ready
      if (response.status === 'warming') {
        console.log('[WoodCraft] Warmup in progress — polling for STL...');
        pollForStl();
      } else if (response.message) {
        console.warn('[WoodCraft]', response.message);
      }
    } catch (err) {
      console.error('[WoodCraft] API failed:', err);
      try {
        await delay(300);
        set({ model: { ...mockModel }, isLoading: false });
      } catch {
        set({ error: 'Failed to load model', isLoading: false });
      }
    }
  },

  updateParameter: async (parameterId: string, value: number) => {
    const { model, currentParams } = get();
    if (!model) return;

    // Optimistic local update
    const updatedParams: Parameter[] = model.parameters.map((p) =>
      p.id === parameterId ? { ...p, value } : p,
    );
    set({ model: { ...model, parameters: updatedParams }, isLoading: true });

    // Build new params object
    const newParams = { ...currentParams };
    if (parameterId in newParams) {
      (newParams as Record<string, number>)[parameterId] = value;
    }
    set({ currentParams: newParams });

    try {
      const response: GenerateModelResponse = await generateModel({
        templateId: newParams.templateId,
        width: newParams.width,
        depth: newParams.depth,
        height: newParams.height,
        tabletopThickness: newParams.tabletopThickness,
        profile: newParams.profile,
        boardMaterial: newParams.boardMaterial,
        stlQuality: 'trimesh',
      });

      const updatedModel: FurnitureModel = {
        ...model,
        id: response.model_id,
        parameters: dimensionsToParameters(response.dimensions),
        components: apiPartsToComponents(response),
      };

      set({ model: updatedModel, isLoading: false, error: null });

      if (response.status !== 'full' && response.message) {
        console.warn(`Backend: ${response.message}`);
      }
    } catch (err) {
      console.error('API call failed on parameter update:', err);
      // Keep the optimistic update but mark as not loading
      set({ isLoading: false });
    }
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

  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),
}));

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
      const components = apiPartsToComponents(response);
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
