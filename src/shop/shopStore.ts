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

/**
 * Three steps, not four. There used to be a `preview` step between the size and
 * the list, and it existed only because that is where the model got built and
 * shown. The model is now always on screen (the right-hand pane), so a step
 * whose whole content was "look at it" has nothing left to do.
 */
export type ShopStep = 'style' | 'size' | 'bom';

export const SHOP_STEPS: readonly ShopStep[] = ['style', 'size', 'bom'];

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

/** The same guard for solves. It has to be a SEPARATE counter: a solve fires
 *  while a build is still running, and if they shared a token the solve would
 *  silently cancel the build it was meant to sit in front of. */
let solveToken = 0;

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
  /**
   * What the viewer draws, and it is one field rather than two on purpose: a
   * solver-only answer and a finished one are the same `ShopModel` shape — the
   * only difference is whether the parts carry `stlUrl`. So the viewer says
   * "STL if you have one, otherwise a box", and this field can be swapped
   * underneath it without either of them knowing which kind it got.
   */
  model: ShopModel | null;
  /** A real CAD build is in flight. Expensive, rare. */
  building: boolean;
  buildFailed: boolean;
  progress: ShopProgress | null;
  /** The dimensions of the last FINISHED build. Only a finished one has an
   *  entry in the server's cache, and only that one can answer `/bom`. */
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
  /** The fast path: ask for the solver's numbers, draw them, start no build. */
  solve: () => Promise<void>;
  /** The slow path: one real CAD build for the current choices.
   *
   *  `retry` is for the retry buttons only, and it is not cosmetic: a failed
   *  build is cached by the server, so an ordinary ask gets the same failure
   *  back for ever. Only an ask that says it is a retry can clear one. */
  build: (retry?: boolean) => Promise<void>;
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

/** The request body for the current choices. One place, because `keyOf` and the
 *  body have to agree: if they ever drifted, the page would ask for one model
 *  and file the answer under another's key, and a cache hit would be recorded
 *  as a miss forever. Both paths — solve and build — go through here. */
function paramsFor(
  templateId: string,
  values: Record<string, number>,
  profile: string,
): ShopGenerateParams {
  return {
    templateId,
    width: values.width ?? 0,
    depth: values.depth ?? 0,
    height: values.height ?? 0,
    tabletopThickness: values.tabletop_thickness ?? 0,
    profile,
  };
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
    // The model is dropped rather than kept: it describes the PREVIOUS
    // furniture, and a stale desk sitting in the viewer while the customer
    // picks a new one is worse than an empty pane for the second it takes the
    // solver to answer.
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
    // One gate, not two. Everything past the catalogue needs a template, and
    // that is the whole of it. The list used to be blocked on a finished model
    // as well, which stopped making sense the moment the build moved onto its
    // own clock: a customer who clicks on before it lands should reach a list
    // that says it is still working, not a button that does nothing.
    if (SHOP_STEPS.indexOf(step) >= 1 && !get().template) return;
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

  async solve() {
    const { template, values, profile } = get();
    if (!template) return;

    const key = keyOf(template.id, values, profile);
    const token = ++solveToken;

    try {
      const model = await generateShopModel({
        ...paramsFor(template.id, values, profile),
        solveOnly: true,
      });
      if (token !== solveToken) return;
      // A finished build for these very dimensions is already drawn, and a box
      // would be a downgrade on the real thing. The server usually settles this
      // itself — a solve-only ask for a cached size is answered from the cache,
      // STLs and all — so this only bites on a race.
      if (get().builtKey === key) return;
      set({ model });
    } catch {
      // Deliberately nothing, and in particular not `buildFailed`: a solve that
      // failed says nothing about whether the build will, and the viewer keeps
      // whatever it was already drawing.
    }
  },

  async build(retry = false) {
    const { template, values, profile, builtKey } = get();
    if (!template) return;

    const key = keyOf(template.id, values, profile);
    // Already have it: the finished model in hand is exactly these dimensions.
    if (key === builtKey && get().model) return;

    const token = ++buildToken;
    const params = paramsFor(template.id, values, profile);

    // Note what is NOT in this `set`: `model`. The solver's answer for these
    // dimensions is nearly always already drawn, and blanking the pane for the
    // tens of seconds a cold build takes is the one thing this pane exists to
    // avoid. The list IS cleared — it describes the old model, not this one.
    set({
      building: true,
      buildFailed: false,
      bom: null,
      progress: null,
    });

    const alive = () => token === buildToken;
    // A build that lands after the customer has moved on describes dimensions
    // nobody is looking at any more. `buildToken` catches a NEWER BUILD; this
    // catches a newer CHOICE, which arrives as a solve and does not touch the
    // build token at all.
    const stillWanted = () => {
      const t = get().template;
      return alive() && !!t && key === keyOf(t.id, get().values, get().profile);
    };

    try {
      // The retry flag goes on THIS ask and no other. On the polls below it
      // would be a loop: a rebuild that fails again leaves the cache holding a
      // failure, and the next poll would then override it and start another
      // build — one doomed build every two seconds until the poll ceiling.
      let model = await generateShopModel(retry ? { ...params, retryFailed: true } : params);
      if (!alive() || !model) return;
      if (stillWanted()) set({ model });

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
        if (stillWanted()) set({ model });
      }

      if (!alive()) return;
      const usable = model.status === 'full' && model.parts.every((p) => p.stlUrl !== null);
      if (!usable) {
        set({ building: false, buildFailed: true });
        return;
      }
      if (!stillWanted()) return;

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
