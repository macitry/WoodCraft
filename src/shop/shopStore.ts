import { create } from 'zustand';
import {
  fetchShopBom,
  fetchShopProgress,
  fetchShopTemplates,
  generateShopModel,
  type ShopBom,
  type ShopGenerateParams,
  type ShopModel,
  type ShopProgress,
  type ShopTemplate,
} from './shopApi';

/**
 * The whole of the customer page's state.
 *
 * It is a store rather than component state because four sibling steps read and
 * write it, and because the thing it holds — the choices — is what the last two
 * steps are *about*: the build reads it, the list reads it, the export reads it.
 *
 * It is deliberately NOT `useModelStore`. That store is the professional
 * editor's: selected components, bracket instances, drilled holes, a mate
 * workflow, scene presets. None of it means anything here, and subscribing to
 * it would drag every one of those concerns into a page that shows a picture
 * and a parts list.
 *
 * One field in here is not a choice: the model. See `build()` for why polling a
 * generate call is the only way to find out whether a build has finished.
 */

export type ShopStep = 'style' | 'size' | 'preview' | 'bom';

export const SHOP_STEPS: readonly ShopStep[] = ['style', 'size', 'preview', 'bom'];

/** Every frame section the backend's solver understands. `profile_size` in
 *  `desk_solver.py` reads the first two characters as millimetres, and it is
 *  what the leg and rail lengths are worked out from — so this list is a real
 *  choice, not a label. */
export const SHOP_PROFILES = ['2020', '3030', '4040'] as const;

/** 2 s between asks, and a ceiling: the background CAD build is a real
 *  build123d run, tens of seconds on a cold cache. */
const POLL_MS = 2000;
const MAX_POLLS = 90;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Identifies the current build so a superseded one cannot write its result
 *  over a newer one's. Module-level, not state: it is a fact about the running
 *  call, not about the page. */
let buildToken = 0;

interface ShopStore {
  step: ShopStep;

  // --- the catalogue ------------------------------------------------------
  templates: ShopTemplate[];
  templatesLoading: boolean;
  templatesFailed: boolean;

  // --- the choices --------------------------------------------------------
  template: ShopTemplate | null;
  /** Current value per parameter id, seeded from the template's `defaultValue`. */
  values: Record<string, number>;
  profile: string;

  // --- the build ----------------------------------------------------------
  model: ShopModel | null;
  building: boolean;
  buildFailed: boolean;
  progress: ShopProgress | null;
  /** The dimensions the model in hand was built from. */
  builtKey: string | null;

  // --- the list -----------------------------------------------------------
  bom: ShopBom | null;
  bomLoading: boolean;
  bomFailed: boolean;

  loadTemplates: () => Promise<void>;
  chooseTemplate: (template: ShopTemplate) => void;
  setValue: (id: string, value: number) => void;
  setProfile: (profile: string) => void;
  goTo: (step: ShopStep) => void;
  next: () => void;
  back: () => void;
  /** Build, unless the model in hand already matches the choices. */
  ensureBuilt: () => Promise<void>;
  retryBuild: () => Promise<void>;
  retryBom: () => Promise<void>;
}

/** The identity of a build: what the cache on the server is really keyed by.
 *  `_cache_key` in server.py hashes exactly these, so two different keys are
 *  two different models and the same key is a free cache hit. */
function keyOf(templateId: string, values: Record<string, number>, profile: string): string {
  return [
    templateId,
    values.width ?? 0,
    values.depth ?? 0,
    values.height ?? 0,
    values.tabletop_thickness ?? 0,
    profile,
  ].join('|');
}

export const useShopStore = create<ShopStore>((set, get) => ({
  step: 'style',

  templates: [],
  templatesLoading: false,
  templatesFailed: false,

  template: null,
  values: {},
  profile: '3030',

  model: null,
  building: false,
  buildFailed: false,
  progress: null,
  builtKey: null,

  bom: null,
  bomLoading: false,
  bomFailed: false,

  async loadTemplates() {
    set({ templatesLoading: true, templatesFailed: false });
    try {
      const templates = await fetchShopTemplates();
      set({ templates, templatesLoading: false });
    } catch {
      set({ templatesLoading: false, templatesFailed: true });
    }
  },

  chooseTemplate(template) {
    // Seeding from `defaultValue` rather than from a constant here is the whole
    // point of taking the parameters off the wire: a second kind of furniture
    // brings its own dimensions and its own limits, and this page does not have
    // to learn about them.
    const values: Record<string, number> = {};
    for (const p of template.parameters) values[p.id] = p.defaultValue;
    set({
      template,
      values,
      step: 'size',
      model: null,
      builtKey: null,
      bom: null,
      buildFailed: false,
    });
  },

  setValue(id, value) {
    set((s) => ({ values: { ...s.values, [id]: value } }));
  },

  setProfile(profile) {
    set({ profile });
  },

  goTo(step) {
    // Forward only as far as the choices reach: everything past the catalogue
    // needs a template, and the list needs a model to describe.
    //
    // The preview needs NEITHER, and that is not an oversight — it is the step
    // that BUILDS the model, so requiring one to reach it would be a door that
    // only opens from the inside. `PreviewStep` starts the build on mount.
    const { template, model } = get();
    const order = SHOP_STEPS.indexOf(step);
    if (order >= 1 && !template) return;
    if (order >= 3 && !model) return;
    set({ step });
  },

  next() {
    const at = SHOP_STEPS.indexOf(get().step);
    const to = SHOP_STEPS[Math.min(at + 1, SHOP_STEPS.length - 1)];
    if (to) get().goTo(to);
  },

  back() {
    const at = SHOP_STEPS.indexOf(get().step);
    const to = SHOP_STEPS[Math.max(at - 1, 0)];
    if (to) set({ step: to });
  },

  async ensureBuilt() {
    const { template, values, profile, builtKey, building } = get();
    if (!template || building) return;
    const key = keyOf(template.id, values, profile);
    // Re-entering the step with nothing changed must not start a second build:
    // the server would treat it as a cache hit anyway, but a page that re-asks
    // on every visit flickers through a loading state for no reason.
    if (key === builtKey && get().model) return;
    await get().retryBuild();
  },

  async retryBuild() {
    const { template, values, profile } = get();
    if (!template) return;

    const token = ++buildToken;
    const key = keyOf(template.id, values, profile);
    const params: ShopGenerateParams = {
      templateId: template.id,
      width: values.width ?? 0,
      depth: values.depth ?? 0,
      height: values.height ?? 0,
      tabletopThickness: values.tabletop_thickness ?? 0,
      profile,
    };

    set({
      building: true,
      buildFailed: false,
      model: null,
      bom: null,
      builtKey: null,
      progress: null,
    });

    const alive = () => token === buildToken;

    try {
      let model = await generateShopModel(params);
      if (!alive()) return;
      set({ model });

      // A cache MISS answers at once with `status: "warming"`: the request
      // carries the solver's numbers and the CAD build is running in a
      // background thread. There is no per-model status endpoint, so the way to
      // find out is to ask for the same dimensions again — the cache is keyed
      // by those dimensions, so the ask is free and eventually returns the
      // finished entry. Anything other than `warming` ends the wait, including
      // a failure status: polling a solver-only result forever would just be a
      // spinner that never stops.
      let polls = 0;
      while (model.status === 'warming' && polls < MAX_POLLS) {
        const progress = await fetchShopProgress().catch(() => null);
        if (!alive()) return;
        if (progress) set({ progress });
        await sleep(POLL_MS);
        if (!alive()) return;
        polls += 1;
        model = await generateShopModel(params);
        if (!alive()) return;
        set({ model });
      }

      if (!alive()) return;
      const usable = model.status === 'full' && model.parts.every((p) => p.stlUrl !== null);
      if (!usable) {
        set({ building: false, buildFailed: true });
        return;
      }

      set({ building: false, builtKey: key });
      await get().retryBom();
    } catch {
      if (!alive()) return;
      set({ building: false, buildFailed: true });
    }
  },

  async retryBom() {
    const modelId = get().model?.modelId;
    if (!modelId) return;
    set({ bomLoading: true, bomFailed: false });
    try {
      const bom = await fetchShopBom(modelId);
      set({ bom, bomLoading: false });
    } catch {
      set({ bomLoading: false, bomFailed: true });
    }
  },
}));
