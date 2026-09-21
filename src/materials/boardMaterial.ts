import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { TabletopTexture } from './tabletopTextures';
import { boardById } from './boardRegistry';

/**
 * Turns a baked board texture into something a tabletop can be drawn with.
 *
 * Three things have to be true at once, and each of them is easy to get wrong in
 * a way that still renders:
 *
 * 1. THE GRAIN HAS TO BE THE RIGHT SIZE. A board is 1200 mm across; the baked
 *    tile is 600 mm. Nothing in the geometry says so — `BoxGeometry` writes UVs
 *    of 0..1 per face, so the default would stretch one tile over the whole desk
 *    and the rings would come out 2 mm apart. A backend STL has no UVs at all.
 *    The UVs are therefore AUTHORED here, per vertex, in tile units, from the
 *    vertex's own position and normal.
 *
 * 2. THE EDGE IS A DIFFERENT SCALE, AND SOMETIMES A DIFFERENT IMAGE. Across the
 *    18 mm of board thickness sits 18 mm of texture, not 600: a face tile mapped
 *    onto the rim would show 3 % of the grain, i.e. nothing. Plywood goes further
 *    and uses a different picture entirely, because its edge is a stack of
 *    veneers and that stack is the only thing that says "plywood" rather than
 *    "pale wood". So a tabletop needs a material ARRAY, one entry per geometry
 *    group, and the geometries in play all disagree about their layout:
 *    `BoxGeometry` has 6 groups (px, nx, py, ny, pz, nz) with the faces at 2 and
 *    3, `ExtrudeGeometry` has 2 (both caps in group 0, walls in 1), and an STL
 *    has none at all. `groupIsFace` asks each group's own normals rather than
 *    assuming an order, and `splitStlByFace` gives the un-grouped case the two
 *    groups it is missing.
 *
 * 3. THE MAPS HAVE TO BE READ IN THE RIGHT COLOUR SPACE. Albedo is sRGB; a
 *    roughness map is plain linear data, and reading it as sRGB brightens every
 *    value in the middle of the range — the board still renders, it just gets
 *    subtly wrong highlights that are very hard to trace back to here.
 *
 * 4. THE BOARD DOES NOT ALWAYS LIE THE SAME WAY. The procedure above is written
 *    against "up is local +Y, and positions are in metres" — true of the
 *    geometries built in `ModelLoader` for a drilled board. An STL tabletop is
 *    authored Z-up and in millimetres, and only becomes Y-up when its MESH is
 *    rotated −90° about X. So the frame is a parameter ({@link BoardFrame})
 *    rather than an assumption: read the UVs off the mesh's own local space, and
 *    the -90° rotation carries them along for free.
 *
 * Loading never suspends. `useLoader` would, and this app has no error boundary:
 * `suspend-react` caches a rejection and rethrows it on every render, so one
 * missing PNG would blank the whole configurator rather than one board's
 * surface. A plain loader plus state degrades to the flat colour underneath.
 */

export interface BoardMaps {
  face: THREE.Texture;
  faceRough: THREE.Texture;
  edge: THREE.Texture;
  edgeRough: THREE.Texture;
}

/** One load per board per session, shared by every mount.
 *
 *  Callers get clones (see `boardMapsFor`), not this object: a texture's
 *  `repeat`/`offset` belong to the texture, so two roles needing two different
 *  tilings cannot share one instance. A `clone()` shares `Texture.source`, so
 *  the extra instances cost a few objects and no extra GPU memory. */
const loads = new Map<string, Promise<BoardMaps>>();

let loader: THREE.TextureLoader | null = null;

/** `mirror` swaps the tiling mode for boards that are not seamless. Every baked
 *  board is authored wrap-aware by the bake script, so plain repetition is
 *  invisible on it; an UPLOADED photograph is not, and repetition would draw a
 *  hard discontinuity every tile. Mirroring folds instead, which on grain reads
 *  as more grain rather than as a mistake.
 *
 *  `Texture.copy` carries both wrap modes, so the per-caller clones below keep
 *  whichever was chosen here — worth stating, because a clone that silently
 *  reset them would look like "mirroring just does not work". */
function loadOne(
  url: string,
  srgb: boolean,
  anisotropy: number,
  mirror: boolean,
): Promise<THREE.Texture> {
  loader ??= new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader!.load(
      url,
      (tex) => {
        const wrap = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
        tex.wrapS = wrap;
        tex.wrapT = wrap;
        // Albedo is sRGB-encoded; a roughness map is LINEAR data. Getting this
        // backwards is invisible in a flat thumbnail and wrong under any light.
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.anisotropy = anisotropy;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => reject(new Error(`board texture failed to load: ${url}`)),
    );
  });
}

function loadBoard(t: TabletopTexture, anisotropy: number): Promise<BoardMaps> {
  const cached = loads.get(t.id);
  if (cached) return cached;
  const mirror = t.wrap === 'mirror';
  const p = Promise.all([
    loadOne(t.faceUrl, true, anisotropy, mirror),
    loadOne(t.faceRoughUrl, false, anisotropy, mirror),
    loadOne(t.edgeUrl, true, anisotropy, mirror),
    loadOne(t.edgeRoughUrl, false, anisotropy, mirror),
  ]).then(([face, faceRough, edge, edgeRough]) => ({ face, faceRough, edge, edgeRough }))
    .catch((e) => {
      loads.delete(t.id);        // let a later mount retry rather than cache the failure
      throw e;
    });
  loads.set(t.id, p);
  return p;
}

/**
 * The board's maps, or null until they arrive (and forever, if they never do —
 * the caller falls back to the flat colour and nothing else changes).
 *
 * `id` of null skips loading entirely, which is what non-tabletop parts pass.
 */
/**
 * Drop a board's cached maps.
 *
 * The cache exists so a board is decoded once per session, and for the baked
 * boards that is the whole story — their images never change. An UPLOADED board
 * is the one case where an id's lifetime ends: deleting it should release the
 * decoded image rather than leave a megabyte per upload pinned here until the
 * tab closes. `boardRegistry.forgetBoard` revokes the object URLs; this releases
 * the other hold on the same bytes.
 *
 * Callers must not do this for a board that is still selectable — a mounted
 * material holding these textures would be left sampling a disposed image.
 */
export function forgetBoardMaps(id: string): void {
  loads.delete(id);
}

export function useBoardMaps(id: string | null, anisotropy = 1): BoardMaps | null {
  const [maps, setMaps] = useState<BoardMaps | null>(null);

  useEffect(() => {
    if (!id) {
      setMaps(null);
      return;
    }
    let live = true;
    const t = boardById(id);
    // A texture's repeat/offset live on the texture, and roles that tile
    // differently must not share one. Clones share the uploaded image, so this
    // is bookkeeping rather than memory.
    loadBoard(t, anisotropy)
      .then((m) => live && setMaps({
        face: m.face.clone(),
        faceRough: m.faceRough.clone(),
        edge: m.edge.clone(),
        edgeRough: m.edgeRough.clone(),
      }))
      .catch(() => live && setMaps(null));
    return () => {
      live = false;
    };
  }, [id, anisotropy]);

  return maps;
}

// ============================================================
// UVs
// ============================================================

/** A face counts as "up" if its normal is mostly ±the board's up axis. Every
 *  geometry in play is axis-aligned, so nothing lands near the threshold except
 *  a deliberate chamfer, which reads as either. */
const FACE_DOT = 0.7;

/**
 * Which local axis is the board's thickness, and how many geometry units one
 * millimetre is.
 *
 * `up: 'y'` is the frame the drilled tabletop is built in: X width, Y thickness,
 * Z depth, positions in metres. `up: 'z'` is an STL tabletop's own frame — X
 * width, Y depth, Z thickness, positions in millimetres — which the mesh then
 * rotates −90° about X into place; authoring the UVs in that frame costs nothing
 * because a mesh transform carries vertex attributes with it.
 */
export interface BoardFrame {
  up: 'y' | 'z';
  mmToUnit: number;
}

/** The frame of the geometries `ModelLoader` builds itself (Y-up, metres). */
export const METRE_FRAME: BoardFrame = { up: 'y', mmToUnit: 0.001 };
/** The frame of a backend STL tabletop (Z-up, millimetres). */
export const STL_FRAME: BoardFrame = { up: 'z', mmToUnit: 1 };

/** The board's up axis and the two horizontal ones, as position/normal
 *  component indices. `a` is the axis the grain runs along (the board's length). */
const AXES = { y: { up: 1, a: 0, b: 2 }, z: { up: 2, a: 0, b: 1 } } as const;

/**
 * Author the tabletop's UVs in TILE UNITS: after this, a material with
 * `repeat = (1, 1)` shows the face tile at its true `faceTileMm` across, and the
 * edge tile through the board's thickness. Must be called on the geometry in its
 * final LOCAL frame — the frame the mesh carries — because the UVs are read off
 * the vertex positions.
 */
export function applyBoardUVs(
  geometry: THREE.BufferGeometry,
  t: TabletopTexture,
  frame: BoardFrame = METRE_FRAME,
): void {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!pos || !nrm || pos.count !== nrm.count) return;

  const { up, a, b } = AXES[frame.up];
  const [edgeAlongMm, edgeThickMm] = t.edgeTileMm;
  const uv = new Float32Array(pos.count * 2);
  const perFaceTile = t.faceTileMm * frame.mmToUnit;
  const perEdgeAlong = edgeAlongMm * frame.mmToUnit;
  const perEdgeThick = edgeThickMm * frame.mmToUnit;

  // Where the board's underside sits on the up axis, so the edge tile can be
  // anchored to it. The edge tile is a STACK — for plywood, a ladder of veneers
  // with a glue line every 1.8 mm — and a stack has a bottom. Sampling it from
  // the board's centre line instead puts the tile's own wrap in the middle of the
  // 18 mm of visible edge, where the bottom of the stack meets the top and one
  // veneer comes out the wrong thickness. Anchored here, a thicker board simply
  // shows more layers, which is what a thicker board does.
  let minUp = Infinity;
  for (let i = 0; i < pos.count; i++) minUp = Math.min(minUp, pos.getComponent(i, up));
  if (!Number.isFinite(minUp)) minUp = 0;

  for (let i = 0; i < pos.count; i++) {
    const nUp = Math.abs(nrm.getComponent(i, up));
    const nA = Math.abs(nrm.getComponent(i, a));

    let u: number;
    let v: number;
    if (nUp >= FACE_DOT) {
      // Top or bottom. u runs along the grain, v across it.
      u = pos.getComponent(i, a) / perFaceTile;
      v = pos.getComponent(i, b) / perFaceTile;
    } else {
      // A rim. u must run ALONG the edge, so it takes whichever horizontal axis
      // this face does not normal to — a face pointing along the grain runs
      // across the board instead.
      u = pos.getComponent(i, nA >= FACE_DOT ? b : a) / perEdgeAlong;
      v = (pos.getComponent(i, up) - minUp) / perEdgeThick;  // up the thickness, from the underside
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Give an un-grouped geometry (i.e. an STL) the two groups the material array
 * needs, by sorting its triangles into a face block and a rim block.
 *
 * `STLLoader` emits one flat run of triangles: no groups, and so nothing for a
 * per-group material to hang off. Two contiguous blocks is the cheapest fix —
 * two draw calls, the same as a box — where adding one group per triangle would
 * mean thousands of draw calls for the same pixels.
 *
 * Groups are keyed by `materialIndex` (what three actually indexes the material
 * array with), so the face block is 0 and the rim block is 1. A geometry that
 * already has groups is left alone: it is a box or an extrusion, and it already
 * says which triangle belongs to which surface.
 */
export function splitStlByFace(geometry: THREE.BufferGeometry, frame: BoardFrame = STL_FRAME): void {
  if (geometry.groups.length) return;
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!pos || !nrm) return;
  const tris = Math.floor(pos.count / 3);
  if (tris === 0) return;

  const up = AXES[frame.up].up;
  // STL facets are flat, so one vertex of a triangle speaks for all three.
  const faceTris: number[] = [];
  const rimTris: number[] = [];
  for (let t = 0; t < tris; t++) {
    (Math.abs(nrm.getComponent(t * 3, up)) >= FACE_DOT ? faceTris : rimTris).push(t);
  }
  if (!faceTris.length || !rimTris.length) return;   // nothing to separate
  const order = faceTris.concat(rimTris);

  // Reorder every attribute the same way. STL geometries carry position and
  // normal; anything else the loader may add is carried along rather than
  // dropped, and a non-float attribute (none today) is left untouched.
  const names = Object.keys(geometry.attributes);
  const rebuilt: [string, THREE.BufferAttribute][] = [];
  for (const name of names) {
    const src = geometry.getAttribute(name) as THREE.BufferAttribute;
    if (!(src.array instanceof Float32Array)) return;
    const { itemSize } = src;
    const dst = new Float32Array(pos.count * itemSize);
    for (let i = 0; i < order.length; i++) {
      const from = order[i] * 3;
      const to = i * 3;
      for (let v = 0; v < 3; v++) {
        for (let c = 0; c < itemSize; c++) {
          dst[(to + v) * itemSize + c] = src.getComponent(from + v, c);
        }
      }
    }
    rebuilt.push([name, new THREE.BufferAttribute(dst, itemSize)]);
  }
  for (const [name, attr] of rebuilt) geometry.setAttribute(name, attr);

  geometry.clearGroups();
  const cut = faceTris.length * 3;
  geometry.addGroup(0, cut, 0);
  geometry.addGroup(cut, pos.count - cut, 1);
}

/**
 * Whether a geometry group is a broad face (top/bottom) rather than a rim.
 *
 * Read off the group's own first triangle rather than a hardcoded index: the
 * geometries disagree about their layout — `BoxGeometry` has six groups and its
 * faces are at 2 and 3, `ExtrudeGeometry` has two and puts both lids in group 0 —
 * and a mistake here renders as "the top of the desk has the plywood layer stack
 * painted on it", which looks like a texture bug rather than an index bug.
 */
function groupIsFace(
  geometry: THREE.BufferGeometry,
  start: number,
  count: number,
  frame: BoardFrame,
): boolean {
  const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!nrm || count === 0) return false;
  const index = geometry.getIndex();
  const vi = index ? index.getX(start) : start;
  return Math.abs(nrm.getComponent(vi, AXES[frame.up].up)) >= FACE_DOT;
}

// ============================================================
// Materials
// ============================================================

export interface BoardLook {
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
}

/**
 * One material per geometry group: the broad faces get the board's face, the
 * rims get its edge.
 *
 * Built imperatively rather than as JSX because the array length depends on the
 * geometry — 6 for a box, 2 for an extrusion or a split STL — and R3F needs them
 * attached one at a time. `DiyProfileRenderer`'s `FaceBox` is the precedent.
 *
 * The two materials are shared across the groups that use them, so the caller
 * must dispose the DISTINCT materials, not the array — `ModelLoader` does.
 */
export function buildBoardMaterials(
  geometry: THREE.BufferGeometry,
  maps: BoardMaps,
  look: BoardLook,
  frame: BoardFrame = METRE_FRAME,
): THREE.MeshStandardMaterial[] {
  // Both `color` and `roughness` are left at their map-multiplying defaults:
  // white so the albedo is the bake's own, and 1 so the roughness map is read at
  // its baked value rather than scaled down into a polished plastic.
  const common = {
    color: '#ffffff',
    roughness: 1,
    metalness: look.metalness,
    emissive: new THREE.Color(look.emissive),
    emissiveIntensity: look.emissiveIntensity,
  };
  const face = new THREE.MeshStandardMaterial({
    ...common,
    map: maps.face,
    roughnessMap: maps.faceRough,
  });
  const edge = new THREE.MeshStandardMaterial({
    ...common,
    map: maps.edge,
    roughnessMap: maps.edgeRough,
  });

  // Keyed by `materialIndex`, not by position in `groups`: that is the number
  // three indexes THIS array with when it draws a group, and the two only
  // coincide for a box. Sparse indices are filled in rather than left as holes,
  // because R3F sets `mesh.material[i]` one at a time and a hole would be a
  // group drawn with no material at all.
  const byIndex = new Map<number, THREE.MeshStandardMaterial>();
  for (const g of geometry.groups) {
    byIndex.set(g.materialIndex ?? 0, groupIsFace(geometry, g.start, g.count, frame) ? face : edge);
  }
  if (!byIndex.size) return [face];    // a geometry with no groups still has to render as something
  const out: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i <= Math.max(...byIndex.keys()); i++) out.push(byIndex.get(i) ?? face);
  return out;
}
