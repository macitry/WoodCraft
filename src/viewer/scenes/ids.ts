/**
 * The scenes the main viewer can put the piece in.
 *
 * `null` is deliberately not a member. It is the OFF state — no shell around
 * the desk, the original rig and the CAD grid back — and it is the absence of a
 * room rather than a room, which is why the store holds `SceneId | null` and
 * this type names only the ones that have something to show.
 *
 * Kept in a file of its own because the store needs it and the store must not
 * pull in a JSX module to get it.
 */
export type SceneId = 'bedroom' | 'daylight' | 'studio' | 'workshop';

/**
 * The night bedroom. The default, and the one scene whose RIG is the page's
 * original one.
 *
 * That pairing is the point of it. The desk under `viewer/Lighting.tsx` is the
 * desk exactly as it looked before any of this existed — the same key, the same
 * fill, the same exposure — so the default view is not a new opinion about the
 * product, it is the old one with a room built around it. `null` (the picker's
 * OFF) still takes the room away and gives back the bare original, which is what
 * makes this safe to open on: nothing about the desk is only reachable through
 * scenery.
 */
export const DEFAULT_SCENE_ID: SceneId = 'bedroom';
