import Lighting from '../Lighting';
import { useModelStore } from '../../store/modelStore';
import type { DictKey } from '../../i18n/dict';
import {
  DaylightRig,
  SceneEnvironment,
  StudioRig,
  WorkshopRig,
} from './lighting';
import { CoveSweep, RoomShell, WALL_Z } from './shell';
import { Bed, FloorLamp, Nightstand, PictureFrame, Plant, Rug, Shelf } from './props';
import type { SceneId } from './ids';

export type { SceneId } from './ids';

/**
 * The four scenes, and the panel that picks between them.
 *
 * A scene is a room, a rig, a background and a set of props, and the pieces are
 * chosen to be COMBINABLE rather than to be four bespoke pictures: the bedroom
 * and the workshop share a shell, the daylight room and the studio share a
 * surface, and the workshop reuses the daylight room's shelf. What makes them
 * read as different places is the light and what is standing in them, which is
 * also why props belong to a scene rather than being a global switch — a rug and
 * a shelf are part of what a room looks like.
 *
 * `bedroom` is the exception in every way, on purpose. It is the only scene lit
 * by the page's original rig and the only one whose shell is a darkened version
 * of it, so the desk in it is the desk the app has always drawn. It is also the
 * reason the picker has an OFF: with the room gone, what is left is that same
 * desk and nothing else.
 */

// ============================================================ the scenes

/** A bedroom at night, with the bedside lamp on.
 *
 *  The one scene whose RIG is the page's original one — `Lighting`, untouched —
 *  and the one whose shell is a darkened version of the dark room's. Both are
 *  the point: the desk here is the desk exactly as it has always been rendered,
 *  and what is new is the room built around it. That is what makes it safe to
 *  open the page on, and it is why the two tints below are a darkening of the
 *  scene's own colours rather than a new palette — the room recedes and the
 *  desk is left where it was.
 *
 *  The lamp is the only prop that lights anything. It is a small, warm,
 *  distance-limited light in the far corner, so what it actually does is give the
 *  bed a reason to be visible and put one pool of warmth in an otherwise cool
 *  frame; the desk is lit by the rig, not by it, which is why the desk reads the
 *  same here as it does with the room switched off.
 */
const BedroomScene: React.FC = () => (
  <>
    <Lighting />
    <SceneEnvironment intensity={0.35} />
    <RoomShell
      floor="floor_oak" floorColor="#3c3a44" floorTint="#333233"
      wall="wall_plaster" wallColor="#2b2a37" wallTint="#2b2e38"
    />
    <Rug texId="rug_weave" at={[-0.2, 0.15]} tint="#7c7875" />
    <Bed position={[-1.42, 0, -1.19]} />
    <Nightstand position={[-0.42, 0, -1.75]} />
  </>
);

/** A daylit room: oak floor, pale walls, and a window's worth of sky.
 *
 *  The floor wears the tabletop's own oak tiles under a stain — the same boards,
 *  a darker product. Untinted they are pale enough that against pale walls the
 *  room reads as one flat cream (the bake's own mean is `rgb(207,179,138)`, which
 *  is a light oak and is right for a desk top), and a floor is where a room's
 *  colour lives. */
const DaylightScene: React.FC = () => (
  <>
    <DaylightRig />
    <SceneEnvironment intensity={0.25} />
    <RoomShell floor="floor_oak" floorColor="#a8814f" floorTint="#e0c8a4"
               wall="wall_plaster" wallColor="#ded9cf" />
    <Rug texId="rug_weave" />
    <PictureFrame position={[0.15, 1.66, WALL_Z + 0.02]} />
    <Plant position={[-1.5, 0, 1.1]} />
    <FloorLamp position={[1.42, 0, -0.62]} light={1.2} />
    <Shelf position={[-1.97, 0, 0.35]} />
  </>
);

/** A studio: one seamless sweep, and nothing in the frame that is not wanted. */
const StudioScene: React.FC = () => (
  <>
    <StudioRig />
    <SceneEnvironment intensity={0.5} />
    <CoveSweep texId="wall_plaster" />
    <Plant position={[-1.55, 0, -0.2]} />
  </>
);

/** A workshop: concrete, a shelf, and a work lamp left on. */
const WorkshopScene: React.FC = () => (
  <>
    <WorkshopRig />
    <SceneEnvironment intensity={0.12} />
    <RoomShell
      floor="floor_concrete" floorColor="#8c8b87"
      wall="floor_concrete" wallColor="#8c8b87" wallTint="#d8d6d2"
    />
    <Shelf position={[-1.97, 0, 0.35]} />
    <FloorLamp position={[1.42, 0, -0.62]} light={2.5} />
  </>
);

// ============================================================ the registry

export interface SceneDef {
  id: SceneId;
  /** Both resolved by the toolbar through `useT`. Typed as `DictKey` so a scene
   *  cannot name a string that does not exist — the panel shows no hard-coded
   *  copy of its own, and `en` is checked against `zh` at compile time. */
  labelKey: DictKey;
  noteKey: DictKey;
  /** The canvas background while this scene is up. Each scene owns its own —
   *  the shells are all open towards the camera, so the backdrop is always
   *  part of the picture, and only the dark room wants the page's navy. */
  background: string;
  Component: React.FC;
}

export const SCENES: SceneDef[] = [
  {
    id: 'bedroom',
    labelKey: 'scene.bedroom',
    noteKey: 'scene.bedroomNote',
    background: '#1a1a2e',
    Component: BedroomScene,
  },
  {
    id: 'daylight',
    labelKey: 'scene.daylight',
    noteKey: 'scene.daylightNote',
    background: '#dce6ef',
    Component: DaylightScene,
  },
  {
    id: 'studio',
    labelKey: 'scene.studio',
    noteKey: 'scene.studioNote',
    background: '#e9e6e0',
    Component: StudioScene,
  },
  {
    id: 'workshop',
    labelKey: 'scene.workshop',
    noteKey: 'scene.workshopNote',
    background: '#22252a',
    Component: WorkshopScene,
  },
];

export function sceneById(id: SceneId | null): SceneDef | null {
  return id ? (SCENES.find((s) => s.id === id) ?? null) : null;
}

// ============================================================ the mount point

/**
 * The scene the panel has selected, or — with none — just the original rig.
 *
 * This is the ONLY place a rig is mounted, which is why `Scene.tsx` no longer
 * renders `Lighting` itself: one mount point is what makes "exactly one rig at
 * a time" a property of the code rather than a thing to remember. A scene
 * brings its own; `null` falls back to the rig the page has always had, with no
 * shell and no environment map — so turning scenes off gives back the original
 * look exactly rather than a close-enough version of it.
 *
 * Nothing here reads any other store field, and no scene is visible to the
 * model: none of them touches a vertex, a volume or a BOM row.
 */
export const SceneRenderer: React.FC = () => {
  const sceneId = useModelStore((s) => s.sceneId);
  const def = sceneById(sceneId);
  if (!def) return <Lighting />;
  return (
    // The scene's own tag, for the probes: it is how a run knows which of the
    // four is mounted without reading the store it just wrote to.
    <group userData={{ wcScene: def.id }}>
      <def.Component />
    </group>
  );
};
