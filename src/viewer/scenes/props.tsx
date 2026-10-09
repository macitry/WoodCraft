import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SurfaceMaterial, tileUVs, useSurfaceMaps } from '../../materials/sceneMaterial';
import { sceneTextureById } from '../../materials/sceneTextures';

/**
 * The set dressing: a rug, a framed print, a plant, a floor lamp, a shelf, a bed
 * and a nightstand.
 *
 * WHERE THEY STAND is not arbitrary, it is worked out against the default
 * camera at [3, 2, 4] looking at the desk. Two constraints, and both of them
 * are the difference between "a room" and "a pile of furniture in the way":
 *
 *  · Never between that camera and the desk. Every position below was projected
 *    onto the camera's screen axes before it was written down: the plant is at
 *    -73 % of frame width and the lamp at +50 %, where the desk occupies ±19 %.
 *  · Nothing tall in the two directions the probes raycast from. A prop that
 *    stood on those lines would be the first thing hit, and the room's whole
 *    promise — that scenery never comes between you and the desk — would be
 *    false, in a way no screenshot would show.
 *
 * The bed is the one prop that TESTS the second rule instead of passing it by
 * being small: it is 2 m long in a 4.2 m room, so it goes in the alcove between
 * the -X wall and the desk's own edge, head against the back wall — and
 * `Bed`'s comment records the probe ray its height was measured against.
 *
 * Everything here is drawn in FLAT COLOUR, which is the honest choice rather
 * than a shortcut, with one exception. The bed base is the largest prop face at
 * 1.94 m, past the 1.6 m wood tile — but a bed base is a solid painted surface,
 * not boards, so there is nothing a map could say about it. The rug is the
 * exception the other way: 2.6 m of floor covering whose weave IS the subject,
 * so it is textured.
 *
 * Like the shell, every mesh here is UNNAMED: `PlacementOverlay` skips a mesh
 * whose name is empty, so no prop is a surface the desk can be dropped onto.
 * `userData.wcRoom = 'prop'` is for the probes, which assert exactly that.
 */

const PROP_TAG = { wcRoom: 'prop' } as const;

const METAL = { color: '#8d9096', roughness: 0.34, metalness: 0.85 } as const;
/** Painted steel, for the shelf. Deliberately NOT `METAL`: a metalness of 0.85
 *  leaves a surface with essentially no diffuse response, so what it shows is
 *  the environment map and nothing else — fine for the lamp, which stands in the
 *  light, but the shelf is in the shaded corner and came out as black posts. The
 *  cheap fix for a black metal is not a brighter lamp but less metal. */
const STEEL = { color: '#8f949a', roughness: 0.5, metalness: 0.2 } as const;
const OAK = { color: '#a8763f', roughness: 0.62, metalness: 0 } as const;

// ============================================================ rug

/** The rug's size, and where it sits on the floor. It is centred slightly
 *  forward of the desk so the desk does not look pinned to its middle. */
const RUG_W = 2.6;
const RUG_D = 1.75;
const RUG_Y = 0.001;

/**
 * A flatweave rug under the desk.
 *
 * It sits 1 mm ABOVE the desk's feet, and it is the one thing in these scenes
 * that RECEIVES a shadow. That looks like it breaks the rule the shell follows,
 * so: the rule is that only one surface may receive in any given column of
 * space, or the contact shadow is laid down twice and the desk looks like it is
 * standing in a stain. This plane is above the transparent catcher (at
 * y = -0.01), it is opaque, and it hides the catcher's copy underneath it — so
 * within the rug's footprint exactly one receiver is visible, and it is this
 * one. Outside the footprint the catcher carries on as before. The desk's legs
 * end 1 mm inside the weave, which is the price of the shadow landing on it
 * rather than beside it.
 */
export const Rug: React.FC<{
  texId: string;
  /** [x, z] on the floor. Defaults to the daylight room's spot, centred a
   *  little forward of the desk. */
  at?: [number, number];
  /** Multiplied into the bake, in linear light. The daylight room wants the
   *  weave's own colour; the bedroom wants the same rug five stops down. */
  tint?: string;
}> = ({ texId, at = [0, 0.05], tint }) => {
  const tex = sceneTextureById(texId);
  const maps = useSurfaceMaps(texId, 16);

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(RUG_W, RUG_D);
    if (tex) tileUVs(g, RUG_W * 1000, RUG_D * 1000, tex.tileMm);
    return g;
  }, [tex]);
  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh
      geometry={geo}
      position={[at[0], RUG_Y, at[1]]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      userData={PROP_TAG}
    >
      <SurfaceMaterial maps={maps} color={tex?.color} tint={tint} rough={0.92} />
    </mesh>
  );
};

// ============================================================ picture

/** Outer frame, in metres. The layers sit 2 mm apart: at 3 m from the camera
 *  that is far past this depth range's trouble, so no two of them can z-fight,
 *  and it is enough for the key light to draw a hairline of shadow under each —
 *  which is the whole of the depth this prop has. */
const FRAME_W = 0.54;
const FRAME_H = 0.74;
const FRAME_STEP = 0.002;

/**
 * A framed print on the back wall: oak border, mount, print.
 *
 * Three coplanar-ISH PLANES, not a modelled frame — and that is a decision, not
 * a shortcut. It is the same rule the walls follow, applied to the thing that
 * hangs on a wall: a plane's normal is +Z, so from behind the wall this print is
 * a backface and is culled exactly when the wall it hangs on is. Modelled as a
 * box, it would keep rendering after the wall went — a print floating against
 * the sky, with the desk behind it — and a scene whose every surface is
 * single-sided should not have one object that isn't. (A probe found this: from
 * straight behind the back wall the box was the first thing a ray to the desk
 * centre hit, where with planes there is nothing to hit.)
 *
 * Two layers on top of the border rather than one flat picture, because a
 * picture is exactly the thing that would read as a placeholder: a mount with a
 * darker rectangle off-centre reads as a print, where one flat colour reads as a
 * missing texture.
 *
 * The 1 mm of offset per layer is what casts the line of shadow that gives it a
 * frame's depth. The border plane casts it; the two above it do not, since
 * anything they would cast lands on the surface directly behind them.
 */
export const PictureFrame: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position} userData={PROP_TAG}>
    <mesh castShadow userData={PROP_TAG}>
      <planeGeometry args={[FRAME_W, FRAME_H]} />
      <meshStandardMaterial {...OAK} />
    </mesh>
    <mesh position={[0, 0, FRAME_STEP]} userData={PROP_TAG}>
      <planeGeometry args={[FRAME_W - 0.08, FRAME_H - 0.08]} />
      <meshStandardMaterial color="#e9e3d7" roughness={0.9} metalness={0} />
    </mesh>
    <mesh position={[-0.03, 0.01, FRAME_STEP * 2]} userData={PROP_TAG}>
      <planeGeometry args={[0.24, 0.34]} />
      <meshStandardMaterial color="#31565b" roughness={0.75} metalness={0} />
    </mesh>
  </group>
);

// ============================================================ plant

const LEAF_GEO = new THREE.SphereGeometry(1, 10, 8);
const LEAF_MATS = [
  new THREE.MeshStandardMaterial({ color: '#3f6b3f', roughness: 0.62 }),
  new THREE.MeshStandardMaterial({ color: '#507f47', roughness: 0.56 }),
];

/**
 * Nine leaves, from one number: the golden angle, so no two yaws ever line up.
 *
 * The angles are what the plant IS, so they are worth stating. A leaf that leans
 * far out of the pot (tilt near 0.5 rad from vertical) has to be the long one,
 * or the plant reads as a flat rosette lying on the rim — which is what a spread
 * of equal, similarly-inclined paddles looks like, and what the first version of
 * this prop looked like from the default camera. So tilt and length move
 * together: the inner leaves are short and near-upright, the outer ones long and
 * leaning, and the size band is wide enough (0.62..1.0) that the silhouette is
 * ragged rather than a starburst.
 */
const LEAVES = Array.from({ length: 9 }, (_, i) => {
  const t = (i % 3) / 2;                      // 0, .5, 1 — three leaf lengths
  return {
    yaw: (i * 137.508 * Math.PI) / 180,
    tilt: 0.38 + 0.60 * t,                    // 22° out to 56° out
    size: 0.62 + 0.38 * t,
  };
});

/** Pot: 0.26 m tall, tapering in, sitting on the floor at the group's origin. */
export const Plant: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position} userData={PROP_TAG}>
    <mesh position={[0, 0.13, 0]} castShadow userData={PROP_TAG}>
      <cylinderGeometry args={[0.10, 0.13, 0.26, 20]} />
      <meshStandardMaterial color="#9c6a52" roughness={0.82} metalness={0} />
    </mesh>
    <mesh position={[0, 0.258, 0]} userData={PROP_TAG}>
      <cylinderGeometry args={[0.095, 0.095, 0.012, 20]} />
      <meshStandardMaterial color="#3b2f26" roughness={1} metalness={0} />
    </mesh>
    {/* Leaves. Nested groups rather than one Euler with three angles: the yaw
        turns the leaf around the stem and the tilt lifts it out of the flower
        pot, and nesting is the only way to say which of the two happens first
        without knowing three's Euler order by heart. */}
    {LEAVES.map((leaf, i) => (
      <group key={i} position={[0, 0.30, 0]} rotation={[0, leaf.yaw, 0]} userData={PROP_TAG}>
        <group rotation={[0, 0, leaf.tilt]}>
          {/* The ellipsoid's long axis is local X, which the two groups above
              have already aimed up and out of the pot. Thin in the other two
              axes and flattened vertically: at this size a leaf with any more
              cross-section reads as a paddle, and the flatter one catches the
              key light differently along its length, which is most of what makes
              it look like a leaf rather than a shape. */}
          <mesh
            geometry={LEAF_GEO}
            material={LEAF_MATS[i % 2]}
            position={[0.19 * leaf.size, 0, 0]}
            scale={[0.24 * leaf.size, 0.035, 0.062 * leaf.size]}
            castShadow
            userData={PROP_TAG}
          />
        </group>
      </group>
    ))}
  </group>
);

// ============================================================ bed

/** The bed's footprint, in metres: 1.4 wide (X), 1.95 long (Z), head against the
 *  back wall.
 *
 *  Z is the long axis and that is forced, not chosen. The room's walls are at
 *  -2.1 and the desk's own edge is at -0.6, so the alcove beside the desk is
 *  1.5 m across — a 2 m bed laid ACROSS it, head against the left wall, would
 *  reach x = -0.1 and run straight through the desk. Running it the other way
 *  puts the headboard on the back wall, where the alcove is 2.1 m deep. */
const BED_W = 1.35;         // along X
const BED_L = 1.80;         // along Z, headboard at -Z
const BED_BASE_H = 0.28;
const BED_MAT_H = 0.20;
const BED_HEAD_H = 0.88;

/**
 * A bed, made: base, mattress, duvet, two pillows, headboard.
 *
 * Every layer is a BOX, and the composition is the whole of the detail — the
 * same economy the shelf uses, but here it earns its keep. The duvet is 120 mm
 * wider than the mattress and 60 mm thick, so it stands proud of the mattress
 * underneath it; that step is what reads as bedding rather than as one slab. A
 * cover the same width as its mattress has no edge for the eye to catch and
 * comes out as a bench.
 *
 * The pillows are two rather than one, and they sit ON the mattress rather than
 * leaning on the headboard. At the default camera the bed is seen from its side
 * and its foot, so the near pillow overlaps the far one — and that overlap is
 * the only cue anywhere in this prop for how far back the bed goes.
 *
 * The headboard is the tallest thing in the scene, and 0.88 m is a measured
 * ceiling rather than a taste: the probe ray from (-4, 2, -4) to the desk centre
 * crosses the headboard's own plane at y = 1.22, so anything under that leaves
 * the ray's promise — no prop ever comes between the camera and the desk —
 * intact. Checked, and re-checked by the probe on every run.
 *
 * The group's origin is the bed's centre on the floor, so `position` places it
 * and every offset below is relative to that.
 *
 * ON THE COLOURS, which are much darker than they look like they should be and
 * are not a mistake. This scene runs the page's ORIGINAL rig, whose irradiance
 * is about 0.48 — fine for a room at 0.05 albedo, and far too much for a bed at
 * 0.6, which lands past the knee of the Cineon curve and comes out a flat, pale
 * slab. (Measured: the first version's duvet rendered at rgb(206,202,195) in a
 * room meant to be dark.) Every value below was therefore SOLVED backwards from
 * the rendered byte it should produce — pick the target, invert the tone curve,
 * divide by the irradiance, and that is the albedo, which is why they read as
 * near-black hexes and are right. Change the rig and these all move.
 */
export const Bed: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position} userData={PROP_TAG}>
    {/* Headboard, against the back wall at -Z. */}
    <mesh position={[0, BED_HEAD_H / 2, -BED_L / 2 + 0.02]} castShadow userData={PROP_TAG}>
      <boxGeometry args={[BED_W + 0.06, BED_HEAD_H, 0.06]} />
      <meshStandardMaterial color="#503b24" roughness={0.62} metalness={0} />
    </mesh>
    {/* Base and mattress: the same footprint, the mattress inset 30 mm. */}
    <mesh position={[0, BED_BASE_H / 2, 0]} castShadow userData={PROP_TAG}>
      <boxGeometry args={[BED_W, BED_BASE_H, BED_L - 0.06]} />
      <meshStandardMaterial color="#312a24" roughness={0.7} metalness={0} />
    </mesh>
    <mesh position={[0, BED_BASE_H + BED_MAT_H / 2, 0]} castShadow userData={PROP_TAG}>
      <boxGeometry args={[BED_W - 0.06, BED_MAT_H, BED_L - 0.10]} />
      <meshStandardMaterial color="#64605a" roughness={0.9} metalness={0} />
    </mesh>
    {/* Duvet: stopping 0.62 m short of the head end, which is the pillow zone,
        and shifted so it laps over the bed's FREE side only. The -X side is
        against the wall — there is nothing there to drape over, and the 1.5 m
        alcove means an overhang on that side would poke into the desk. */}
    <mesh position={[0.03, BED_BASE_H + BED_MAT_H + 0.015, 0.18]} castShadow userData={PROP_TAG}>
      <boxGeometry args={[BED_W + 0.06, 0.06, BED_L - 0.62]} />
      <meshStandardMaterial color="#555966" roughness={0.95} metalness={0} />
    </mesh>
    {[-0.33, 0.33].map((x) => (
      <mesh key={x} position={[x, BED_BASE_H + BED_MAT_H + 0.05, -BED_L / 2 + 0.30]}
            castShadow userData={PROP_TAG}>
        <boxGeometry args={[0.60, 0.10, 0.34]} />
        <meshStandardMaterial color="#6e6a62" roughness={0.95} metalness={0} />
      </mesh>
    ))}
  </group>
);

// ============================================================ nightstand

const STAND_H = 0.50;

/**
 * A bedside table with a lamp on it — the nightstand, the lamp, and the reason
 * this scene is lit at all.
 *
 * The lamp is a small one: a tapered shade over a point light, the same trick
 * `FloorLamp` uses and for the same reason (a light you can see is what stops a
 * room from reading as lit by nothing). It is `distance`-limited and decays, so
 * its pool is the corner it stands in; the desk is a metre and a half away and
 * is lit by the room's own rig, which is why the desk looks the same here as it
 * does with the room switched off.
 *
 * The shade's emissive is what makes the lamp read as ON in a dark room, and it
 * is deliberately stronger here than the floor lamp's: this is the only lamp in
 * the scene and there is no daylight behind it to compete with.
 */
export const Nightstand: React.FC<{ position: [number, number, number]; light?: number }> = ({
  position, light = 3.2,
}) => (
  <group position={position} userData={PROP_TAG}>
    <mesh position={[0, STAND_H / 2, 0]} castShadow userData={PROP_TAG}>
      <boxGeometry args={[0.44, STAND_H, 0.40]} />
      <meshStandardMaterial color="#3c3129" roughness={0.72} metalness={0} />
    </mesh>
    {/* A single drawer front, proud of the box: the one line of detail that says
        furniture rather than crate. A step lighter than the box, for the same
        solved-backwards reason the bed's colours are dark — the difference is
        what has to read, not the absolute value. */}
    <mesh position={[0, STAND_H - 0.13, 0.202]} userData={PROP_TAG}>
      <boxGeometry args={[0.36, 0.16, 0.012]} />
      <meshStandardMaterial color="#45382d" roughness={0.7} metalness={0} />
    </mesh>
    <mesh position={[0, STAND_H + 0.02, 0]} castShadow userData={PROP_TAG}>
      <cylinderGeometry args={[0.05, 0.07, 0.04, 16]} />
      <meshStandardMaterial {...METAL} />
    </mesh>
    <mesh position={[0, STAND_H + 0.14, 0]} castShadow userData={PROP_TAG}>
      <cylinderGeometry args={[0.13, 0.085, 0.20, 20, 1, true]} />
      <meshStandardMaterial
        color="#f4ead4"
        roughness={0.72}
        metalness={0}
        side={THREE.DoubleSide}
        emissive="#ffd39a"
        emissiveIntensity={0.9}
      />
    </mesh>
    {light > 0 && (
      <pointLight
        position={[0, STAND_H + 0.16, 0]}
        color="#ffcf94"
        intensity={light}
        distance={5}
        decay={2}
      />
    )}
  </group>
);

// ============================================================ floor lamp

const LAMP_POLE_H = 1.3;

/**
 * A floor lamp that is actually ON.
 *
 * The only prop allowed to add light, and the reason it is worth having: it is
 * a light source you can see, which is what stops a room from reading as lit by
 * nothing in particular. Its bulb is a point light inside the shade, so the
 * shade's interior lights up as well as the floor around it — which needs the
 * shade to be double-sided, and it is the only thing here that is: the
 * single-sided rule belongs to the shell, where a backface is what keeps a wall
 * from ever hiding the desk. A lamp shade's inside is a surface you are meant
 * to see.
 */
export const FloorLamp: React.FC<{
  position: [number, number, number];
  /** 0 in a room that is already bright; the workshop keeps it on. */
  light?: number;
}> = ({ position, light = 3 }) => (
  <group position={position} userData={PROP_TAG}>
    <mesh position={[0, 0.01, 0]} castShadow userData={PROP_TAG}>
      <cylinderGeometry args={[0.13, 0.15, 0.02, 24]} />
      <meshStandardMaterial {...METAL} />
    </mesh>
    <mesh position={[0, LAMP_POLE_H / 2 + 0.02, 0]} castShadow userData={PROP_TAG}>
      <cylinderGeometry args={[0.011, 0.011, LAMP_POLE_H, 12]} />
      <meshStandardMaterial {...METAL} />
    </mesh>
    <mesh position={[0, 1.24, 0]} castShadow userData={PROP_TAG}>
      <cylinderGeometry args={[0.13, 0.175, 0.24, 24, 1, true]} />
      <meshStandardMaterial
        color="#f2ecdd"
        roughness={0.7}
        metalness={0}
        side={THREE.DoubleSide}
        emissive="#ffd9a6"
        emissiveIntensity={0.35}
      />
    </mesh>
    {light > 0 && (
      <pointLight
        position={[0, 1.26, 0]}
        color="#ffd9a6"
        intensity={light}
        distance={6}
        decay={2}
      />
    )}
  </group>
);

// ============================================================ shelf

/** Books standing on the shelves — muted, and never the same height twice. */
const BOOKS = [
  { h: 0.20, z: -0.30, c: '#5b6b73' },
  { h: 0.17, z: -0.24, c: '#8a5a44' },
  { h: 0.23, z: -0.13, c: '#6b6f5a' },
  { h: 0.19, z: -0.07, c: '#3f4a5a' },
  { h: 0.21, z: 0.16, c: '#7d6a4f' },
  { h: 0.18, z: 0.21, c: '#54606b' },
];
const SHELF_BOARDS = [0.34, 0.72, 1.10];

/**
 * An open shelf against a wall: two posts, three boards, some books.
 *
 * It faces +X, so it wants the -X wall. Its books are what make it read as a
 * shelf rather than as a trestle — and their slight variety is the whole
 * reason they are a table rather than a loop over one size.
 */
export const Shelf: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position} userData={PROP_TAG}>
    {/* Steel posts, oak boards — the desk's own combination, so the shelf reads
        as the same kind of furniture rather than as a bookcase that happens to
        be in the room. Black posts were the first attempt and they were wrong:
        against a white wall a black vertical is the loudest thing in the frame,
        and it is not what the eye should go to. */}
    {[-0.45, 0.45].map((z) => (
      <mesh key={z} position={[0, 0.625, z]} castShadow userData={PROP_TAG}>
        <boxGeometry args={[0.03, 1.25, 0.26]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
    ))}
    {SHELF_BOARDS.map((y) => (
      <mesh key={y} position={[0, y, 0]} castShadow userData={PROP_TAG}>
        <boxGeometry args={[0.26, 0.022, 0.90]} />
        <meshStandardMaterial {...OAK} />
      </mesh>
    ))}
    {BOOKS.map((b, i) => {
      // Two of the six stand on the middle board, four on the top one.
      const board = i < 2 ? SHELF_BOARDS[1] : SHELF_BOARDS[2];
      return (
        <mesh key={i} position={[0.01, board + 0.011 + b.h / 2, b.z]} castShadow userData={PROP_TAG}>
          <boxGeometry args={[0.16, b.h, 0.035]} />
          <meshStandardMaterial color={b.c} roughness={0.8} metalness={0} />
        </mesh>
      );
    })}
  </group>
);
