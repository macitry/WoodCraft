// ---------------------------------------------------------------------------
// Which boards exist, and how one is looked up.
//
// The baked boards are DATA — a generated array in `tabletopTextures.ts`. This
// module is the other half: the ones the user uploaded, which exist only at
// runtime and only in this browser.
//
// The lookup lives here rather than in the generated file for a reason worth
// stating: `boardById` is the single resolution point for the whole pipeline
// (`useBoardMaps`, `setTabletopTexture`'s normalisation, the three `boardTile`
// reads in `ModelLoader`), and a `.find` over the baked array can never see an
// upload. Left there, EVERY upload would silently render as oak — the id would
// look valid to the picker and resolve to a different board everywhere else.
//
// Two structures, one writer: the zustand slice holds `customBoards` so React
// re-renders, and this Map is what the three non-React call sites read. Both are
// written by the store action, registry first, so no render can observe one
// without the other. Nothing else may mutate either.
// ---------------------------------------------------------------------------

import {
  DEFAULT_TABLETOP_TEXTURE,
  TABLETOP_TEXTURES,
  type TabletopTexture,
} from './tabletopTextures';
import { t } from '../i18n';

/** What an uploaded board IS, before it becomes a descriptor.
 *
 *  Blobs rather than URLs, because this is also the shape that goes to
 *  IndexedDB — `Blob` is structured-cloneable natively, and storing a derived
 *  object URL would persist a handle that is dead by the next page load. */
export interface BoardRecord {
  id: string;
  /** What the picker prints. The file name, as uploaded. */
  label: string;
  /** Swatch fallback colour — the mean of the crop, measured at upload. */
  color: string;
  /** Millimetres of board the cropped square covers. THE number that decides
   *  whether the grain comes out at the right size; see `buildDescriptor`. */
  tileMm: number;
  faceBlob: Blob;
  roughBlob: Blob;
}

interface Entry {
  rec: BoardRecord;
  faceUrl: string;
  roughUrl: string;
  /** Replaced wholesale when `tileMm` changes — never mutated in place. */
  desc: TabletopTexture;
}

const custom = new Map<string, Entry>();

/** A square tile, so `faceTileMm` stays the scalar the whole UV path is written
 *  against: `applyBoardUVs` divides both axes by it, and `edgeTileMm` is the
 *  same pair as oak's. The edge reuses the face image (a photo cannot derive
 *  plywood's veneer stack, and pretending otherwise would be a lie in geometry).
 *
 *  `wrap: 'mirror'` — a photo is not tileable. The baked boards are authored
 *  wrap-aware by the bake script, so `RepeatWrapping` is seamless for them; an
 *  upload would show a hard discontinuity every `tileMm`. Mirroring puts a
 *  barely-visible fold there instead, which for grain reads as more grain. */
function buildDescriptor(rec: BoardRecord, faceUrl: string, roughUrl: string): TabletopTexture {
  return {
    id: rec.id,
    label: rec.label,
    // Built from the record, never stored: a stored string would be left
    // describing a tile size the user has since changed.
    note: t('name.uploadedBoardNote', { mm: rec.tileMm }),
    color: rec.color,
    faceUrl,
    faceRoughUrl: roughUrl,
    faceTileMm: rec.tileMm,
    edgeUrl: faceUrl,
    edgeRoughUrl: roughUrl,
    edgeTileMm: [rec.tileMm, rec.tileMm],
    wrap: 'mirror',
  };
}

/**
 * An id that cannot collide with a baked board or with another upload.
 *
 * Deliberately NOT a counter: a counter restarts at 0 on every page load, so the
 * first upload after a reload would take an id that IndexedDB already holds —
 * and the `loads` cache in `boardMaterial` is keyed by id alone, so the old
 * image would be served for the new one.
 */
export function makeBoardId(): string {
  return `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Add a board and return its descriptor, creating the object URLs it needs.
 *
 * The URLs are made HERE and nowhere else, so this module is the single owner of
 * their lifetime — they must outlive every texture loaded from them, and be
 * revoked exactly once. That is the whole reason `registerBoard` and
 * `forgetBoard` are a pair.
 *
 * Re-registering an id that is already present returns the EXISTING descriptor
 * and creates nothing. `main.tsx` renders in `StrictMode`, so a mount effect
 * runs twice in development and hydration is called twice with the same records;
 * without this guard the second call would revoke the URLs the first call's
 * descriptor (already in the store) was pointing at.
 */
export function registerBoard(rec: BoardRecord): TabletopTexture {
  const existing = custom.get(rec.id);
  if (existing) return existing.desc;

  const faceUrl = URL.createObjectURL(rec.faceBlob);
  const roughUrl = URL.createObjectURL(rec.roughBlob);
  const desc = buildDescriptor(rec, faceUrl, roughUrl);
  custom.set(rec.id, { rec, faceUrl, roughUrl, desc });
  return desc;
}

/** Drop a board and revoke its URLs. The images have long since been decoded and
 *  uploaded to the GPU, so revoking now cannot blank a board that is on screen;
 *  it just stops the blobs being reachable. Callers must ALSO evict the texture
 *  cache (`forgetBoardMaps`) — the URLs and that cache are two separate holds on
 *  the same megabytes. */
export function forgetBoard(id: string): void {
  const e = custom.get(id);
  if (!e) return;
  URL.revokeObjectURL(e.faceUrl);
  URL.revokeObjectURL(e.roughUrl);
  custom.delete(id);
}

/**
 * Re-state a board's tile size, returning its NEW descriptor — or null if the id
 * is not an upload.
 *
 * A new object, not a mutated one, and the images are NOT re-created: `tileMm`
 * only affects UV authoring, and `ModelLoader` holds the descriptor in a useMemo
 * dependency list, so a fresh identity is what makes the board re-tile itself.
 * (This is why `custom:<stamp>` ids need no cache invalidation — the picture
 * under an id never changes, only this number.)
 */
export function retileBoard(id: string, tileMm: number): TabletopTexture | null {
  const e = custom.get(id);
  if (!e) return null;
  e.rec = { ...e.rec, tileMm };
  e.desc = buildDescriptor(e.rec, e.faceUrl, e.roughUrl);
  return e.desc;
}

/** The record behind an upload, for re-persisting after a tile-size change. */
export function boardRecord(id: string): BoardRecord | null {
  return custom.get(id)?.rec ?? null;
}

/** Everything the picker offers: the baked boards, then the uploads. Baked
 *  first, so an upload can never shadow one of them. */
export function listBoards(): TabletopTexture[] {
  return [...TABLETOP_TEXTURES, ...[...custom.values()].map((e) => e.desc)];
}

/** True for an uploaded board's id — the picker uses this to decide which
 *  affordances (tile size, delete) a chip gets. */
export function isCustomBoard(id: string): boolean {
  return custom.has(id);
}

/**
 * Resolve an id to a board. Unknown ids fall back to the default, so a model or
 * a persisted selection naming a board that has since been deleted still
 * renders — the contract `setTabletopTexture` has always had.
 */
export function boardById(id?: string | null): TabletopTexture {
  return (
    TABLETOP_TEXTURES.find((t) => t.id === id) ??
    custom.get(id ?? '')?.desc ??
    TABLETOP_TEXTURES.find((t) => t.id === DEFAULT_TABLETOP_TEXTURE)!
  );
}
