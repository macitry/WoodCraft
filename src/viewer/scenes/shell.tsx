import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SurfaceMaterial, tileUVs, useSurfaceMaps } from '../../materials/sceneMaterial';
import { sceneTextureById } from '../../materials/sceneTextures';

/**
 * The shells a scene can put around the desk: a corner room, and a studio sweep.
 *
 * Everything here is scenery. It is not in the model, not in the BOM, not in any
 * export, and it changes no geometry — hence a scene being a view flag in the
 * store rather than anything on the model.
 *
 * TWO RULES EVERY MESH IN THIS FILE OBEYS, and both are load-bearing:
 *
 * 1. NO MESH IS NAMED. `PlacementOverlay`'s raycast skips any mesh whose name is
 *    empty, so an unnamed floor is not a surface the desk can be dropped onto.
 *    The alternative — teaching the overlay to skip scenery — would mean putting
 *    a scenery test on the hot path. The tags below (`userData.wcRoom`) are for
 *    the probes; `name` is what the app reads, and it stays `''`.
 *
 * 2. SINGLE-SIDED, NORMALS INWARD. Whichever wall ends up between the camera and
 *    the desk shows a backface and is culled, so the room is a cutaway from
 *    every orbit angle and can never hide the thing it exists to show. Anything
 *    double-sided here would break exactly that.
 */

/** Floor level. The desk's legs end at y = 0 and stand on this. */
export const FLOOR_Y = -0.02;
/** A standard ceiling height: the walls have to reach above the eye-line or the
 *  corner does not read as a corner. */
export const WALL_H = 2.7;
/** Wall spacing, in metres. The desk spans about 1.2 × 0.6 m, so this leaves it
 *  roughly 1.5 m of clearance — a room, not a warehouse. */
export const ROOM = 4.2;
/** The floor runs this much further than the walls, on the two open sides only.
 *  A floor cut off flush with the wall line stops dead inside the frame and the
 *  eye reads the edge as a cut, not a floor; extending it the way the room is
 *  open puts that edge off-screen. The two closed sides stay flush with the
 *  walls they meet. */
export const FLOOR_OVERHANG = 2;

/** Where the corner is, in world coordinates: the two walls stand on -X and -Z,
 *  i.e. behind the desk from the default camera at [3, 2, 4]. */
export const WALL_X = -ROOM / 2;
export const WALL_Z = -ROOM / 2;

const SHELL_TAG = { wcRoom: 'room' } as const;

interface TiledPlaneProps {
  /** A generated `SCENE_TEXTURES` id, or null for a scene whose surfaces are a
   *  flat colour — which is the dark room, and is the whole of what makes it
   *  the record of the original look that the other three are compared to. */
  texId: string | null;
  /** Metres. The bake's tiling is applied at the surface's true size. */
  w: number;
  h: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  /** The colour when there is no map: the flat surface itself, or the bake's
   *  own swatch in the moment before its PNG arrives. */
  color: string;
  /** Multiplied into the baked albedo. White keeps the bake exactly.
   *
   *  Careful: three multiplies in LINEAR light, so a mid-grey tint is not a
   *  nudge but a four-fold darkening — `#8a8b86` lands at 0.25, not 0.55. Every
   *  tint here is therefore chosen against what it does in linear, and the two
   *  uses are a slightly darker second surface (the workshop's walls) and a
   *  stained floor over the tabletop's own oak (daylight). */
  tint?: string;
  /** Used only while the map is absent — the map carries the real value. */
  rough?: number;
}

/**
 * A plane wearing a baked surface at its true scale.
 *
 * The geometry is built here rather than on the tabletop's `BoxGeometry`+group
 * path because a floor is one surface: no edge tile, no material array, no
 * question of which group is a face.
 */
const TiledPlane: React.FC<TiledPlaneProps> = ({
  texId, w, h, position, rotation, color, tint, rough = 0.9,
}) => {
  const tex = texId ? sceneTextureById(texId) : undefined;
  const maps = useSurfaceMaps(texId, 8);

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h);
    if (tex) tileUVs(g, w * 1000, h * 1000, tex.tileMm);
    return g;
  }, [w, h, tex]);
  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh geometry={geo} position={position} rotation={rotation} userData={SHELL_TAG}>
      <SurfaceMaterial maps={maps} color={tex?.color ?? color} tint={tint} rough={rough} />
    </mesh>
  );
};

export interface ShellSurfaces {
  /** Baked surface ids, or null for a flat colour (see `TiledPlaneProps.texId`). */
  floor: string | null;
  /** The floor's colour when flat, and the fallback while a map loads. */
  floorColor: string;
  floorTint?: string;
  wall: string | null;
  wallColor: string;
  wallTint?: string;
}

/**
 * The corner room: a floor and two walls meeting behind the desk.
 *
 * The floor sits 10 mm BELOW the transparent shadow catcher `ModelLoader` puts
 * at y = -0.01, and it does not receive shadows. That catcher is the scene's
 * only shadow receiver, and it has to stay that way: a second receiver 10 mm
 * under it would take the same contact shadow again and the desk would look
 * like it is sitting in a stain. The floor being strictly underneath is what
 * makes that impossible rather than merely unlikely.
 */
export const RoomShell: React.FC<ShellSurfaces> = ({
  floor, floorColor, floorTint, wall, wallColor, wallTint,
}) => (
  <group>
    <TiledPlane
      texId={floor}
      w={ROOM + FLOOR_OVERHANG}
      h={ROOM + FLOOR_OVERHANG}
      position={[FLOOR_OVERHANG / 2, FLOOR_Y, FLOOR_OVERHANG / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      color={floorColor}
      tint={floorTint}
      rough={0.85}
    />
    {/* Both walls are single-sided with their normals pointing into the room
        (a plane's normal is +Z before rotation), which is rule 2 above. */}
    <TiledPlane
      texId={wall} w={ROOM} h={WALL_H}
      position={[0, FLOOR_Y + WALL_H / 2, WALL_Z]}
      color={wallColor}
      tint={wallTint}
      rough={0.95}
    />
    <TiledPlane
      texId={wall} w={ROOM} h={WALL_H}
      position={[WALL_X, FLOOR_Y + WALL_H / 2, 0]}
      rotation={[0, Math.PI / 2, 0]}
      color={wallColor}
      tint={wallTint}
      rough={0.95}
    />
  </group>
);

/** How wide the studio sweep is. Wider than anything the camera can frame from
 *  inside the room, so its two edges are never in shot — which is what makes it
 *  read as infinite rather than as a wall with a corner.
 *
 *  It is 24 and not 14 because 14 was NOT wide enough, in a way that is easy to
 *  miss and was: at the frame's upper left the ray does not meet the wall, it
 *  meets the COVE — where the surface is 2 m further from the camera than the
 *  wall is — so the leftmost few pixels of the frame reached x ≈ -7.35 and fell
 *  off the end, showing 13 px of page background (#e9e6e0, 233) against the
 *  sweep's 217. A one-pixel-wide, sixteen-level wedge in a scene whose whole
 *  point is a background that disappears. Width costs one quad either way. */
const COVE_LENGTH = 24;
/** The radius of the sweep. Small enough to fit a corner of this room, large
 *  enough that the curve is not a fillet: this is the whole difference between
 *  a seamless backdrop and a wall with a skirting. */
const COVE_RADIUS = 0.8;
/** The flat floor in FRONT of the sweep. It has to run out past the camera, not
 *  just past the desk: the floor the default camera can actually see reaches
 *  about 2.4 m in front of the desk, and a sweep that stopped short of that
 *  would end in a hard edge inside the frame. Same distance as the room's own
 *  floor overhang, for the same reason. */
const COVE_APRON = ROOM + FLOOR_OVERHANG;
const COVE_SEGMENTS = 24;

/**
 * One swept surface: the floor, curving up into the back wall, as a single
 * mesh.
 *
 * That it is a SINGLE mesh is the entire point of a cyclorama. Built as a floor
 * plane plus a wall plane plus a fillet, the joins between the three would be
 * three more edges to see — and in a white studio, where the background is
 * meant to disappear, a hairline at the bottom of the wall is the most visible
 * thing in the picture. One swept profile has no join to show.
 *
 * The profile is a list of [z, y] points in metres, traversed from the floor
 * end to the top of the wall. The winding is chosen so `computeVertexNormals`
 * comes out pointing INTO the room — the same single-sided rule the room's
 * walls follow, and the reason a scene can never occlude the desk.
 */
function sweepGeometry(
  profile: readonly (readonly [number, number])[],
  length: number,
  tileMm: number,
): THREE.BufferGeometry {
  const cols = profile.length;
  const pos = new Float32Array(cols * 2 * 3);
  const uv = new Float32Array(cols * 2 * 2);
  const mPerTile = tileMm / 1000;
  const half = length / 2;

  // Arc length along the profile, so the texture does not stretch around the
  // curve: v is distance in millimetres, not "fraction of the profile".
  let s = 0;
  for (let i = 0; i < cols; i++) {
    const [z, y] = profile[i];
    if (i > 0) {
      const [pz, py] = profile[i - 1];
      s += Math.hypot(z - pz, y - py);
    }
    for (let c = 0; c < 2; c++) {
      const v = i * 2 + c;
      const x = c === 0 ? -half : half;
      pos[v * 3] = x;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = z;
      uv[v * 2] = (x + half) / mPerTile;
      uv[v * 2 + 1] = s / mPerTile;
    }
  }

  // Two triangles per bay. (a, b, c) with a = i,col0 and b = i,col1 puts the
  // face normal along +X × (profile tangent), which on the floor is +Y and on
  // the wall is +Z — inward both times.
  const idx = new Uint16Array((cols - 1) * 6);
  let k = 0;
  for (let i = 0; i < cols - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2 + 1;
    const d = (i + 1) * 2;
    idx[k++] = a; idx[k++] = b; idx[k++] = c;
    idx[k++] = a; idx[k++] = c; idx[k++] = d;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/** How tall the sweep climbs. Taller than the room's walls, and it has to be:
 *  a cyclorama that ends inside the frame is a wall with a horizon, and the strip
 *  of page background above its top edge is the one thing in the picture that
 *  says "this is a box, not a studio". At the default camera the frame's top edge
 *  is about 2.9 m up where the sweep stands, so 4 m clears it from any camera the
 *  orbit control can reach while still looking at the desk. */
const COVE_WALL_H = 4.0;

/** The cove profile: apron, quarter-arc, wall. */
function coveProfile(wallH: number): [number, number][] {
  const points: [number, number][] = [
    [WALL_Z + COVE_APRON, FLOOR_Y],
    [WALL_Z + COVE_RADIUS, FLOOR_Y],
  ];
  for (let i = 1; i <= COVE_SEGMENTS; i++) {
    const phi = (i / COVE_SEGMENTS) * (Math.PI / 2);
    points.push([
      WALL_Z + COVE_RADIUS - COVE_RADIUS * Math.sin(phi),
      FLOOR_Y + COVE_RADIUS * (1 - Math.cos(phi)),
    ]);
  }
  points.push([WALL_Z, FLOOR_Y + wallH]);
  return points;
}

/**
 * The studio sweep, one per scene. Built once at module scope: the profile is a
 * constant, and a geometry that is never disposed is the correct lifetime for
 * one that is always needed.
 */
export const CoveSweep: React.FC<{ texId: string; tint?: string }> = ({ texId, tint }) => {
  const tex = sceneTextureById(texId);
  const maps = useSurfaceMaps(texId, 8);
  const geo = useMemo(
    () => sweepGeometry(coveProfile(COVE_WALL_H), COVE_LENGTH, tex?.tileMm ?? 1000),
    [tex],
  );
  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh geometry={geo} userData={SHELL_TAG}>
      <SurfaceMaterial maps={maps} color={tex?.color} tint={tint} />
    </mesh>
  );
};
