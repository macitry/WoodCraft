import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { sceneTextureById } from './sceneTextures';

/**
 * A baked scene surface — a floor, a wall, a cove, a rug — as maps a mesh can
 * be drawn with.
 *
 * The one thing this file has to get right is SCALE, and it is the same problem
 * `boardMaterial.ts` solves for tabletops: nothing in a `PlaneGeometry` says how
 * big the thing it is drawn on is. Its UVs run 0..1 whatever the plane's size,
 * so a baked tile would stretch over the whole floor and the boards would come
 * out metres wide. The UVs are therefore authored — `tileUVs` below — in TILE
 * UNITS, from the size of the surface each geometry was built for, and every
 * caller leaves `texture.repeat` at (1, 1).
 *
 * Two smaller things, both copied from the tabletop path because both are easy
 * to get wrong in a way that still renders:
 *
 *   · ALBEDO IS sRGB, A ROUGHNESS MAP IS NOT. Reading the second as sRGB
 *     brightens every value in the middle of the range: the surface still draws,
 *     it just stops matching the bake under any light.
 *   · A MISSING PNG MUST NOT TAKE THE PAGE DOWN. `useLoader` would suspend, and
 *     this app has no error boundary — `suspend-react` caches the rejection and
 *     rethrows it on every render, so one absent file would blank the whole
 *     configurator instead of one wall. A plain loader plus state degrades to
 *     the flat colour the generated table carries.
 */

export interface SurfaceMaps {
  color: THREE.Texture;
  rough: THREE.Texture;
}

/** One load per texture per session, shared by every mount. */
const loads = new Map<string, Promise<SurfaceMaps>>();

let loader: THREE.TextureLoader | null = null;

function loadOne(url: string, srgb: boolean, anisotropy: number): Promise<THREE.Texture> {
  loader ??= new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader!.load(
      url,
      (tex) => {
        // Every baked surface is authored wrap-aware by `bake_scene_textures.py`
        // — integer lattices, lattice counts that close on the tile — so plain
        // repetition is invisible on it. This is also why nothing here sets
        // `repeat`: the tiling lives in the geometry's UVs, so one texture
        // instance serves as many differently-sized surfaces as it likes, and
        // callers share it directly rather than taking the clones `boardMaterial`
        // needs. Anisotropy is the one per-caller setting that then belongs to
        // whoever mounted first; that is deliberate — it is a sampling-quality
        // knob, and the surfaces that want more of it are the ones built first.
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.anisotropy = anisotropy;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => reject(new Error(`scene texture failed to load: ${url}`)),
    );
  });
}

function loadSurface(id: string, anisotropy: number): Promise<SurfaceMaps> {
  const cached = loads.get(id);
  if (cached) return cached;

  const t = sceneTextureById(id);
  if (!t) return Promise.reject(new Error(`unknown scene texture: ${id}`));

  const p = Promise.all([
    loadOne(t.colorUrl, true, anisotropy),
    loadOne(t.roughUrl, false, anisotropy),
  ])
    .then(([color, rough]) => ({ color, rough }))
    .catch((e) => {
      loads.delete(id);   // let a later mount retry rather than cache the failure
      throw e;
    });
  loads.set(id, p);
  return p;
}

/**
 * The surface's maps, or null until they arrive — and forever, if they never
 * do, in which case the caller draws the descriptor's flat colour and nothing
 * else changes.
 */
export function useSurfaceMaps(id: string | null, anisotropy = 8): SurfaceMaps | null {
  const [maps, setMaps] = useState<SurfaceMaps | null>(null);

  useEffect(() => {
    if (!id) {
      setMaps(null);
      return;
    }
    let live = true;
    loadSurface(id, anisotropy)
      .then((m) => live && setMaps(m))
      .catch(() => live && setMaps(null));
    return () => {
      live = false;
    };
  }, [id, anisotropy]);

  return maps;
}

/**
 * Rewrite a geometry's UVs from 0..1 into TILE UNITS, given how much surface it
 * actually covers and how much of that surface one baked tile spans.
 *
 * This is the whole of the scale contract: after it, a material with
 * `repeat = (1, 1)` shows one tile per `tileMm` millimetres, exactly as baked.
 * Both sizes are in millimetres because that is the unit the bake declares —
 * `tileMm` comes off the generated table, and the surface's own size comes from
 * the geometry, which is built in metres.
 *
 * It scales the geometry's own UVs rather than authoring them from vertex
 * positions (`applyBoardUVs`'s approach) because every geometry here is a
 * primitive with a well-defined 0..1 parameterisation — a plane's width and
 * height, a cylinder's arc and its length — and scaling that is both exact and
 * independent of orientation. The callers below are the only places that rely
 * on it, and each says which parameterisation it means.
 */
export function tileUVs(
  geometry: THREE.BufferGeometry,
  sizeUmm: number,
  sizeVmm: number,
  tileMm: number,
): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return;
  const ku = sizeUmm / tileMm;
  const kv = sizeVmm / tileMm;
  const a = uv.array as Float32Array;
  for (let i = 0; i < a.length; i += 2) {
    a[i] *= ku;
    a[i + 1] *= kv;
  }
  uv.needsUpdate = true;
}

/**
 * A surface wearing `useSurfaceMaps`'s maps — the only way a scene mesh should
 * be drawn.
 *
 * It exists for the reason the third bullet at the top of this file does not
 * mention, because it is not a convention but a trap: A MATERIAL THAT HAS
 * RENDERED ONCE WITHOUT A MAP CANNOT SIMPLY BE GIVEN ONE. three compiles a
 * program per material variant, the variant is chosen from which maps are set,
 * and assigning `material.map` afterwards does not mark the material dirty — so
 * the mesh keeps rendering with the program it built while the map was still in
 * flight, which is a surface drawn in its fallback colour for the rest of the
 * session. Nothing throws and nothing logs; the only symptom is that every
 * baked texture in the scene is invisible and the surfaces read as flat, which
 * is exactly what the fallback colours look like on purpose. (Found by
 * measuring: the floor's own 85-level range arrived on screen as 1 level of
 * variation, and forcing `needsUpdate` on the live material restored it.)
 *
 * `key` is the fix, and it is the whole reason this component exists: when the
 * maps arrive the key changes, React replaces the material, and its replacement
 * is compiled WITH the maps from its first frame. Written out at each call site
 * instead, it would be one line that looks like noise and would be dropped by
 * the next person to add a surface.
 */
export const SurfaceMaterial: React.FC<{
  maps: SurfaceMaps | null;
  /** The flat surface when there is no map, or the bake's own swatch while it
   *  loads. A tint does not apply to it — see `tint`. */
  color?: string;
  /** Multiplied into the baked albedo, in LINEAR light (see `ShellSurfaces`). */
  tint?: string;
  /** Used only while the map is absent; the map carries the real value. */
  rough?: number;
  /** FrontSide unless a surface is meant to be seen from both sides. */
  side?: THREE.Side;
}> = ({ maps, color, tint, rough = 0.9, side }) => (
  <meshStandardMaterial
    key={maps ? 'mapped' : 'flat'}
    color={maps ? (tint ?? '#ffffff') : (color ?? '#ffffff')}
    map={maps?.color ?? null}
    roughnessMap={maps?.rough ?? null}
    roughness={maps ? 1 : rough}
    metalness={0}
    side={side ?? THREE.FrontSide}
  />
);
