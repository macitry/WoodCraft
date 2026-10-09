import { useRef, useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useModelStore } from '../store/modelStore';
import { TEMPLATE_LAYOUTS } from '../types/furniture';
import type { Component, ViewPreset } from '../types/furniture';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import CameraController from './CameraController';
import Lighting from './Lighting';
import ModelLoader from './ModelLoader';
import PlacementOverlay from './PlacementOverlay';
import RoomScene from './RoomScene';

interface SceneProps {
  viewPreset: ViewPreset;
  onControlsReady?: (controls: OrbitControlsImpl) => void;
}

/** Compute world position (meters) of a component from its pose + layout config. */
function getComponentWorldPos(
  part: Component,
  width: number,
  depth: number,
  height: number,
  thickness: number,
  ps: number,
  insetX: number,
  insetZ: number,
): [number, number, number] {
  const mm = (v: number) => v / 1000;
  const w = mm(width);
  const d = mm(depth);
  const h = mm(height);
  const t = mm(thickness);
  const profile = mm(ps);
  const ix = mm(insetX);
  const iz = mm(insetZ);
  const legH = h - t - profile;
  const beamY = h - t - profile / 2;
  const lx = w / 2 - ix - profile / 2;
  const lz = d / 2 - iz - profile / 2;

  switch (part.partType) {
    case 'tabletop':
      return [0, h - t / 2, 0];
    case 'leg': {
      if (part.id.includes('front_left')) return [lx, legH / 2, lz];
      if (part.id.includes('front_right')) return [-lx, legH / 2, lz];
      if (part.id.includes('back_left')) return [lx, legH / 2, -lz];
      if (part.id.includes('back_right')) return [-lx, legH / 2, -lz];
      return [0, legH / 2, 0];
    }
    case 'beam': {
      const bz = d / 2 - iz - profile / 2;
      const bx = w / 2 - ix - profile / 2;
      if (part.id === 'beam_front') return [0, beamY, bz];
      if (part.id === 'beam_back') return [0, beamY, -bz];
      if (part.id === 'beam_left') return [bx, beamY, 0];
      if (part.id === 'beam_right') return [-bx, beamY, 0];
      return [0, beamY, 0];
    }
    default:
      return [0, h / 2, 0];
  }
}

const Scene: React.FC<SceneProps> = ({ viewPreset, onControlsReady }) => {
  const model = useModelStore((s) => s.model);
  const isLoading = useModelStore((s) => s.isLoading);
  const selectedComponentId = useModelStore((s) => s.selectedComponentId);
  const selectedBracketId = useModelStore((s) => s.selectedBracketId);
  const brackets = useModelStore((s) => s.brackets);
  const cp = useModelStore((s) => s.currentParams);
  const showRoom = useModelStore((s) => s.showRoom);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Dev-only, same convention as `__wcDiyScene` / `__wcKitEditorScene`: the
  // tabletop's surface is chosen here and its UVs are authored per vertex, so
  // checking that a board is drawn at the RIGHT SCALE means measuring the mounted
  // geometry against the tile sizes the generated table declares. A rendered
  // pixel cannot tell 17 mm rings from 2 mm rings. `__wcMainControls` publishes
  // the camera; this publishes what the camera is looking at.
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcMainScene?: unknown };
    w.__wcMainScene = scene;
    return () => {
      delete w.__wcMainScene;
    };
  }, [scene]);

  const handleControlsMounted = (controls: OrbitControlsImpl | null) => {
    if (controls && onControlsReady) {
      controlsRef.current = controls;
      onControlsReady(controls);
    }
  };

  // Compute focus target from selection
  const focusTarget = useMemo((): [number, number, number] | null => {
    // Priority: selected bracket > selected component
    if (selectedBracketId) {
      const bracket = brackets.find((b) => b.id === selectedBracketId);
      if (bracket) {
        return [
          bracket.position.x / 1000,
          bracket.position.y / 1000,
          bracket.position.z / 1000,
        ];
      }
    }

    if (selectedComponentId && model) {
      const comp = model.components.find((c) => c.id === selectedComponentId);
      if (comp) {
        const layout = TEMPLATE_LAYOUTS[cp.templateId] || TEMPLATE_LAYOUTS['basic-desk'];
        const ps = layout?.profileSize ?? 30;
        const insetX = (layout?.insetRatioX ?? 0) * cp.width;
        const insetZ = (layout?.insetRatioZ ?? 0) * cp.depth;
        return getComponentWorldPos(
          comp, cp.width, cp.depth, cp.height,
          cp.tabletopThickness, ps, insetX, insetZ,
        );
      }
    }

    return null;
  }, [selectedComponentId, selectedBracketId, model, brackets, cp]);

  if (!model && !isLoading) {
    return (
      <>
        <color attach="background" args={['#1a1a2e']} />
        <ambientLight intensity={0.3} />
      </>
    );
  }

  if (isLoading || !model) {
    return (
      <>
        <color attach="background" args={['#1a1a2e']} />
        <ambientLight intensity={0.3} />
      </>
    );
  }

  return (
    <>
      <color attach="background" args={['#1a1a2e']} />
      <Lighting />
      <CameraController
        viewPreset={viewPreset}
        controlsRef={controlsRef}
        onMounted={handleControlsMounted}
        focusTarget={focusTarget}
        focusDistance={0.25}
      />
      {/* The grid and the room say the same thing twice — "here is the floor" —
          and they disagree: the grid is a CAD 8 m square floating 15 mm above
          the room's floor, running out past its walls. Only one of them shows at
          a time. */}
      {!showRoom && (
        <gridHelper
          args={[8, 20, '#303050', '#202035']}
          position={[0, -0.005, 0]}
        />
      )}
      <RoomScene />
      <ModelLoader model={model} />
      <PlacementOverlay />
    </>
  );
};

export default Scene;
