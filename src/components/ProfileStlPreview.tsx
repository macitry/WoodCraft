import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';

// ---------------------------------------------------------------------------
// Profile STL URL index (matches DiyProfileRenderer)
// ---------------------------------------------------------------------------

export const PROFILE_STL_URLS: Record<string, string> = {
  '2020': '/profiles/profile_2020.stl',
  '3030': '/profiles/profile_3030.stl',
  '4040': '/profiles/profile_4040.stl',
};

/** How long the preview extrusion section is (mm). */
const PREVIEW_LENGTH_MM = 50;
const M = 0.001;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ProfileStlPreviewProps {
  profileSize: number;
  /** Canvas size in px (default 140). */
  size?: number;
}

/**
 * Loads the real profile STL, compresses the extrusion to a short section
 * and displays the static end-face view.  Bright background with a subtle
 * reference grid.
 */
const ProfileStlPreview: React.FC<ProfileStlPreviewProps> = ({
  profileSize,
  size = 270,
}) => {
  return (
    <Canvas
      camera={{ position: [0, 0, 0.10], fov: 35, near: 0.001, far: 1 }}
      style={{ width: size, height: size, background: '#f5f5f5', borderRadius: 4 }}
      gl={{ antialias: true }}
    >
      {/* Grid reference plane */}
      <gridHelper
        args={[0.08, 16, '#cccccc', '#e8e8e8']}
        position={[0, -0.022, 0]}
      />

      {/* Lighting */}
      <ambientLight intensity={0.45} />
      <directionalLight position={[0.06, 0.08, 0.05]} intensity={0.75} />
      <directionalLight position={[-0.04, -0.02, -0.04]} intensity={0.25} />

      <Suspense fallback={null}>
        <ProfileMesh profileSize={profileSize} />
      </Suspense>
    </Canvas>
  );
};

/** Loads + processes the STL, auto-rotating. */
const ProfileMesh: React.FC<{ profileSize: number }> = ({
  profileSize,
}) => {
  const groupRef = useRef<THREE.Group>(null!);
  const sizeKey = profileSize.toString();
  const url = PROFILE_STL_URLS[sizeKey] || PROFILE_STL_URLS['3030'];
  const rawGeom = useLoader(STLLoader, url);

  const processed = useMemo(() => {
    const g = rawGeom.clone();
    const pos = g.getAttribute('position');

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;

    const origLenZ = maxZ - minZ;
    const scaleZ = origLenZ > 0 ? (PREVIEW_LENGTH_MM * M) / origLenZ : PREVIEW_LENGTH_MM * M;

    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        (pos.getX(i) - cx) * M,
        (pos.getY(i) - cy) * M,
        (pos.getZ(i) - cz) * scaleZ,
      );
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [rawGeom]);

  useFrame((_, delta) => {
    groupRef.current.rotation.y += delta * 0.5;
    groupRef.current.rotation.x += delta * 0.10;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={processed}>
        <meshStandardMaterial
          color="#c8c8c8"
          metalness={0.55}
          roughness={0.38}
        />
      </mesh>
    </group>
  );
};

export default ProfileStlPreview;
