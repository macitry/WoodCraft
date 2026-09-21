// ---------------------------------------------------------------------------
// Keeping uploaded boards across a reload.
//
// IndexedDB, not localStorage, because the payload is a photograph: a 1024² PNG
// is ~1 MB, and localStorage's ~5 MB is a whole-browser budget shared with the
// kit layouts already in there. IndexedDB also stores a Blob natively, where
// localStorage would force a base64 round trip that inflates it by a third.
//
// The one KEY that is small enough to belong beside the others — which board is
// selected — stays in localStorage, matching `diy.leftW` (DiyPage) and the kit
// layouts. It is a string.
//
// Every function here is total: it resolves, it never rejects, and it degrades
// to "no stored boards" rather than to a broken page. A browser in private mode,
// a blocked origin, a quota-exceeded write, a record written by an older schema
// — all of those must cost the user their uploads and nothing else. That is the
// same bar `kitLayoutStore` sets for its own storage.
// ---------------------------------------------------------------------------

import type { BoardRecord } from './boardRegistry';

const DB_NAME = 'woodcraft';
const DB_VERSION = 1;
const STORE = 'boards';
const SELECTED_KEY = 'woodcraft.tabletopTexture';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      // A blocked upgrade (another tab on an older version) must not hang the
      // caller forever; giving up means "this session does not persist".
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** One transaction, and a promise that settles either way. */
function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          t.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/**
 * Is this record usable? A record can come back from another version of the app,
 * or from a write that was interrupted, and one bad entry must not take the list
 * down with it — nor reach the renderer, where a missing `faceBlob` would become
 * a texture that never loads and a board that silently falls back to a flat
 * colour with no explanation.
 */
function isUsable(v: unknown): v is BoardRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Partial<BoardRecord>;
  return (
    typeof r.id === 'string' && r.id.length > 0 &&
    typeof r.label === 'string' &&
    typeof r.color === 'string' &&
    typeof r.tileMm === 'number' && Number.isFinite(r.tileMm) && r.tileMm > 0 &&
    r.faceBlob instanceof Blob &&
    r.roughBlob instanceof Blob
  );
}

/** Every stored board, newest last. Invalid records are dropped, silently —
 *  there is no sane partial recovery for a photograph we cannot decode. */
export async function loadBoards(): Promise<BoardRecord[]> {
  const all = await tx<BoardRecord[]>('readonly', (s) => s.getAll() as IDBRequest<BoardRecord[]>);
  return (all ?? []).filter(isUsable);
}

export async function saveBoard(rec: BoardRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(rec));
}

export async function deleteBoard(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

/**
 * The selected board's id — a string, so localStorage, and the only piece of
 * this feature's state that is not a Blob.
 *
 * Stored because the alternative is a half-state: the uploaded board sits in the
 * picker while the highlight is back on oak. Reading is best-effort and returns
 * null on anything unexpected, which the caller treats as "no preference".
 */
export function loadSelectedBoardId(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedBoardId(id: string): void {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    // A full or disabled localStorage costs the user the selection, not the
    // session — the board itself is already on screen.
  }
}
