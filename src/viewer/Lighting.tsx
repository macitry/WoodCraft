/**
 * Lighting setup for the 3D scene.
 * Provides ambient light, key light, fill light, and rim light
 * for a product-visualization look.
 */

const Lighting: React.FC = () => {
  return (
    <>
      {/* Soft ambient fill */}
      <ambientLight intensity={0.4} color="#ffffff" />

      {/* Key light — warm, from upper-right-front */}
      <directionalLight
        position={[8, 12, 8]}
        intensity={2.5}
        color="#fff8ee"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0001}
      />

      {/* Fill light — cooler, from left */}
      <directionalLight
        position={[-6, 3, -2]}
        intensity={0.8}
        color="#e8f0ff"
      />

      {/* Rim light — from behind, adds depth */}
      <directionalLight
        position={[0, 3, -8]}
        intensity={1.2}
        color="#ffffff"
      />

      {/* Ground bounce — subtle light from below */}
      <directionalLight
        position={[0, -1, 0]}
        intensity={0.3}
        color="#d4c8b0"
      />

      {/* Hemisphere light for sky/ground gradient */}
      <hemisphereLight
        args={['#b1e1ff', '#3d2b1f', 0.3]}
      />
    </>
  );
};

export default Lighting;
