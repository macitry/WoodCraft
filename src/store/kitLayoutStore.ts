// ---------------------------------------------------------------------------
// Kit layouts — the user's per-part adjustments to an accessory kit.
//
// A kit's parts stay DERIVED (see utils/accessoryKits); this store only holds
// the edits layered on top, keyed by `${kitId}@${holePatternSignature}`. Two
// consequences worth keeping in mind:
//
//   · an untouched (kit, connector) pair has NO entry at all — not an empty
//     object — so the renderers and the BOM keep taking the byte-for-byte
//     derived path they always did. `getLayout` returns null for those.
//   · "reset" means DELETE the key, which is the only way back to the preset
//     built in ACCESSORY_KITS. Editing a kit is editing its definition, so the
//     preset has to stay recoverable or the change is permanent and invisible.
//
// Nothing here renders or computes geometry — it is a persisted bag of deltas.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import type { ExtraPart, HardwareSpec, KitLayout, PartEdit } from '../utils/accessoryKits';
import { EMPTY_LAYOUT, accessoryKitById, kitLayoutKey, offsetFromAbsolute, resizeScrew } from '../utils/accessoryKits';
import type { ScrewSize } from '../types/furniture';

export type Vec3 = [number, number, number];

const STORAGE_KEY = 'woodcraft.kitLayouts.v1';
/** Bump when the persisted shape changes; mismatched payloads are discarded
 *  rather than migrated — the worst case is losing cosmetic tweaks. */
const SCHEMA = 1;

/** Re-exported so consumers have one import for the whole key story.
 *  `` `${kitId}@${patternSig}` `` — the pattern, not a connector id: see the note
 *  on holePatternSignature for why the distinction is load-bearing. */
export { kitLayoutKey };

function kitIdOf(setKey: string): string {
  const i = setKey.indexOf('@');
  return i < 0 ? setKey : setKey.slice(0, i);
}

// ---------------------------------------------------------------------------
// Persistence — hand-rolled, matching the bare localStorage already used for the
// DIY splitter (this repo has no zustand/persist and this is not worth a
// dependency). Every path is non-throwing: a corrupt payload, a full quota or a
// disabled localStorage must all degrade to "no edits", never to a broken page.
// ---------------------------------------------------------------------------

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

const isScrewSize = (v: unknown): v is ScrewSize => v === 'M4' || v === 'M5' || v === 'M6';
const isKind = (v: unknown) => v === 'socket_screw' || v === 't_nut' || v === 'wood_screw';

/**
 * Rebuild a layout from untrusted JSON field by field, dropping anything that
 * does not typecheck. Returns null for a layout with nothing left in it, so
 * empties never get a persisted entry (and so never show a 「已微调」 badge).
 */
function sanitise(raw: unknown): KitLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<KitLayout>;

  const parts: Record<string, PartEdit> = {};
  if (r.parts && typeof r.parts === 'object') {
    for (const [key, entry] of Object.entries(r.parts)) {
      if (!key || !entry || typeof entry !== 'object') continue;
      const edit: PartEdit = {};
      if (isVec3(entry.offset)) edit.offset = entry.offset;
      if (isVec3(entry.rotOffset)) edit.rotOffset = entry.rotOffset;
      if (isScrewSize(entry.size)) edit.size = entry.size;
      if (typeof entry.length === 'number' && Number.isFinite(entry.length)) edit.length = entry.length;
      if (entry.removed === true) edit.removed = true;
      const clean = normalise(edit);
      if (clean) parts[key] = clean;
    }
  }

  const extra: ExtraPart[] = [];
  if (Array.isArray(r.extra)) {
    for (const e of r.extra) {
      if (!e || typeof e !== 'object') continue;
      const p = e as Partial<ExtraPart>;
      const spec = p.spec;
      if (typeof p.id !== 'string' || !p.id) continue;
      if (!spec || typeof spec !== 'object' || typeof spec.name !== 'string' || !isKind(spec.kind)) continue;
      if (!isVec3(p.position) || !isVec3(p.rotation)) continue;
      const clean: HardwareSpec = { kind: spec.kind, name: spec.name };
      if (isScrewSize(spec.size)) clean.size = spec.size;
      if (typeof spec.length === 'number' && Number.isFinite(spec.length)) clean.length = spec.length;
      extra.push({
        id: p.id,
        spec: clean,
        position: p.position,
        rotation: p.rotation,
        internal: p.internal === true,
      });
    }
  }

  return Object.keys(parts).length === 0 && extra.length === 0 ? null : { parts, extra };
}

function load(): Record<string, KitLayout> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const { v, layouts } = parsed as { v?: unknown; layouts?: unknown };
    if (v !== SCHEMA || !layouts || typeof layouts !== 'object') return {};
    const out: Record<string, KitLayout> = {};
    for (const [setKey, value] of Object.entries(layouts as Record<string, unknown>)) {
      // A kit that has since been renamed or removed must not come back.
      if (!accessoryKitById(kitIdOf(setKey))) continue;
      const clean = sanitise(value);
      if (clean) out[setKey] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function persist(layouts: Record<string, KitLayout>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA, layouts }));
  } catch {
    // Quota exceeded / storage disabled: the session keeps working in memory.
  }
}

// ---------------------------------------------------------------------------
// Edit algebra
// ---------------------------------------------------------------------------

/**
 * Reduce an edit to the fields that actually say something. A part returned to
 * its preset must lose its entry entirely: an edit object holding only no-op
 * values would still be non-empty, and the parts list would badge a part as
 * 「已微调」 that nobody has touched.
 */
function normalise(edit: PartEdit): PartEdit | null {
  const out: PartEdit = {};
  if (edit.offset && (edit.offset[0] !== 0 || edit.offset[1] !== 0 || edit.offset[2] !== 0)) out.offset = edit.offset;
  if (edit.rotOffset && (edit.rotOffset[0] !== 0 || edit.rotOffset[1] !== 0 || edit.rotOffset[2] !== 0)) out.rotOffset = edit.rotOffset;
  if (edit.size) out.size = edit.size;
  if (typeof edit.length === 'number') out.length = edit.length;
  if (edit.removed === true) out.removed = true;
  return Object.keys(out).length > 0 ? out : null;
}

/** Write one part's edit (null clears it) and drop the key if the layout empties. */
function setEdit(
  layouts: Record<string, KitLayout>,
  setKey: string,
  partKey: string,
  edit: PartEdit | null,
): Record<string, KitLayout> {
  const cur = layouts[setKey] ?? EMPTY_LAYOUT;
  const parts = { ...cur.parts };
  const next = edit ? normalise(edit) : null;
  if (next) parts[partKey] = next;
  else delete parts[partKey];
  return commit(layouts, setKey, { parts, extra: cur.extra });
}

function commit(
  layouts: Record<string, KitLayout>,
  setKey: string,
  layout: KitLayout,
): Record<string, KitLayout> {
  const next = { ...layouts };
  if (Object.keys(layout.parts).length === 0 && layout.extra.length === 0) delete next[setKey];
  else next[setKey] = layout;
  persist(next);
  return next;
}

const isExtraKey = (key: string) => key.startsWith('extra:');

/**
 * Write one hand-added part. A derived part holds DELTAS against its seat; an
 * added part has no seat, so its position and rotation are the absolute values
 * themselves — the same three actions with a zero base. Anything aimed at an
 * extra must land here and never in `parts`, which is keyed by derived seat and
 * has no room for it.
 */
function updateExtra(
  layouts: Record<string, KitLayout>,
  setKey: string,
  partKey: string,
  patch: Partial<ExtraPart>,
): Record<string, KitLayout> {
  const cur = layouts[setKey] ?? EMPTY_LAYOUT;
  const extra = cur.extra.map((e) => (`extra:${e.id}` === partKey ? { ...e, ...patch } : e));
  return commit(layouts, setKey, { parts: cur.parts, extra });
}

let _nextId = 1;
const uid = () => `x${_nextId++}_${Date.now().toString(36)}`;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface KitLayoutState {
  /** Only (kit, pattern) pairs that have been edited appear here. */
  layouts: Record<string, KitLayout>;
  /** The (kit, connector) the editor page is currently showing. */
  editingKey: string | null;
  /** The part the property panel edits; a `partKey` or `extra:<id>`. */
  selectedPartKey: string | null;

  /** Move a part to an absolute catalog-mm position, storing the delta. */
  setPartPosition: (setKey: string, partKey: string, base: Vec3, absolute: Vec3) => void;
  /** Rotate a part by a delta in DEGREES (XYZ order — see PartEdit). */
  setPartRotation: (setKey: string, partKey: string, rotOffset: Vec3) => void;
  /** Re-spec a screw, dropping the override when it lands back on `base`. */
  setPartSpec: (setKey: string, partKey: string, size: ScrewSize, length: number, base: HardwareSpec) => void;
  setPartRemoved: (setKey: string, partKey: string, removed: boolean) => void;
  /** Add hardware by hand; returns the key the new part can be selected by. */
  addPart: (setKey: string, spec: HardwareSpec, position: Vec3, rotation: Vec3) => string;
  /** Clear one part's edit — for a derived part that restores the preset seat. */
  clearPart: (setKey: string, partKey: string) => void;
  /** Clear every edit for one (kit, connector). */
  resetKit: (setKey: string) => void;
  setEditingKey: (setKey: string | null) => void;
  selectPart: (partKey: string | null) => void;
  __resetAll: () => void;
}

export const useKitLayoutStore = create<KitLayoutState>((set, get) => ({
  layouts: load(),
  editingKey: null,
  selectedPartKey: null,

  setPartPosition: (setKey, partKey, base, absolute) => {
    const layouts = get().layouts;
    if (isExtraKey(partKey)) {
      set({ layouts: updateExtra(layouts, setKey, partKey, { position: absolute }) });
      return;
    }
    const cur = layouts[setKey] ?? EMPTY_LAYOUT;
    set({ layouts: setEdit(layouts, setKey, partKey, { ...cur.parts[partKey], offset: offsetFromAbsolute(base, absolute) }) });
  },

  setPartRotation: (setKey, partKey, rotOffset) => {
    const layouts = get().layouts;
    if (isExtraKey(partKey)) {
      set({ layouts: updateExtra(layouts, setKey, partKey, { rotation: rotOffset }) });
      return;
    }
    const cur = layouts[setKey] ?? EMPTY_LAYOUT;
    set({ layouts: setEdit(layouts, setKey, partKey, { ...cur.parts[partKey], rotOffset }) });
  },

  setPartSpec: (setKey, partKey, size, length, base) => {
    const layouts = get().layouts;
    // A T-nut is not re-speccable: its name carries a profile series that `size`
    // does not determine, so an override here would print a name that lies.
    if (base.kind === 't_nut') return;
    if (isExtraKey(partKey)) {
      // An added part has no preset spec to fall back on, so the new spec becomes
      // its own — there is no override to drop when it lands back on `base`.
      set({ layouts: updateExtra(layouts, setKey, partKey, { spec: resizeScrew(base, size, length) }) });
      return;
    }
    const cur = layouts[setKey] ?? EMPTY_LAYOUT;
    const next: PartEdit = { ...cur.parts[partKey] };
    if (base.size === size && base.length === length) {
      delete next.size;
      delete next.length;
    } else {
      next.size = size;
      next.length = length;
    }
    set({ layouts: setEdit(layouts, setKey, partKey, next) });
  },

  setPartRemoved: (setKey, partKey, removed) => {
    const cur = get().layouts[setKey] ?? EMPTY_LAYOUT;
    // A hand-added part has no preset seat to fall back to, so "hidden" and
    // "deleted" are the same thing for it: drop it. It must never reach `parts`,
    // which is keyed by derived seat and has no room for an extra.
    if (isExtraKey(partKey)) {
      if (!removed) return;
      const extra = cur.extra.filter((e) => `extra:${e.id}` !== partKey);
      set({ layouts: commit(get().layouts, setKey, { parts: cur.parts, extra }) });
      return;
    }
    const edit: PartEdit = { ...cur.parts[partKey] };
    if (removed) edit.removed = true;
    else delete edit.removed;
    set({ layouts: setEdit(get().layouts, setKey, partKey, edit) });
  },

  addPart: (setKey, spec, position, rotation) => {
    const cur = get().layouts[setKey] ?? EMPTY_LAYOUT;
    const id = uid();
    // `internal` follows the KIND, never a UI toggle: a T-nut carries no seat of
    // its own and is drawn ghosted under x-ray only, so adding one without
    // setting this would put invisible hardware into the BOM.
    const part: ExtraPart = { id, spec, position, rotation, internal: spec.kind === 't_nut' };
    set({ layouts: commit(get().layouts, setKey, { parts: cur.parts, extra: [...cur.extra, part] }) });
    return `extra:${id}`;
  },

  clearPart: (setKey, partKey) => {
    const cur = get().layouts[setKey] ?? EMPTY_LAYOUT;
    if (isExtraKey(partKey)) {
      const extra = cur.extra.filter((e) => `extra:${e.id}` !== partKey);
      set({ layouts: commit(get().layouts, setKey, { parts: cur.parts, extra }) });
      return;
    }
    set({ layouts: setEdit(get().layouts, setKey, partKey, null) });
  },

  resetKit: (setKey) => {
    const layouts = { ...get().layouts };
    delete layouts[setKey];
    persist(layouts);
    set({ layouts });
  },

  setEditingKey: (setKey) => set({ editingKey: setKey, selectedPartKey: null }),
  selectPart: (partKey) => set({ selectedPartKey: partKey }),

  __resetAll: () => {
    persist({});
    set({ layouts: {}, editingKey: null, selectedPartKey: null });
  },
}));

/**
 * The edits for a (kit, connector) pair, or null when it has never been touched.
 * Returns the STORED object by reference (or the null primitive), so it is safe
 * to put straight into a useMemo dependency list.
 */
export function useKitLayout(setKey: string | null): KitLayout | null {
  return useKitLayoutStore((s) => (setKey ? (s.layouts[setKey] ?? null) : null));
}

/**
 * The edits for a kit as seen through a particular connector — the form every
 * renderer and panel needs, since each resolves its own `stlUrl`.
 *
 * A NEW STORE DOES NOT RE-RENDER ANYTHING THAT DOES NOT SUBSCRIBE TO IT. Every
 * consumer of `jointFasteners`/`kitSchedule` must call this (or useKitLayout),
 * not merely receive a layout it read once, or an edit would move the part in the
 * editor and leave the 3D and the BOM showing the old position.
 *
 * Returns the stored object by reference, or null — so it is safe as a useMemo
 * dependency and cannot loop the way a freshly-built object would.
 */
export function useKitLayoutFor(kitId: string | null | undefined, stlUrl?: string | null): KitLayout | null {
  return useKitLayout(kitId ? kitLayoutKey(kitId, stlUrl) : null);
}
