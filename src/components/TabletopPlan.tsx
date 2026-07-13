import { useMemo } from 'react';
import { useModelStore } from '../store/modelStore';

/**
 * 2D top-down plan view of the tabletop.
 *
 * Shows the tabletop outline with leg mounting points, beam positions,
 * and dimension labels. Designed to be extended for custom cutout/hole design.
 *
 * Coordinate system: tabletop center at origin, X=right, Y=up (on screen).
 * All units in mm.
 */

interface MountPoint {
  name: string;
  x: number;    // mm, from tabletop center
  y: number;    // mm, from tabletop center
  type: 'leg' | 'beam_endpoint' | 'beam_center';
}

const COLORS = {
  tabletop: '#d4a574',
  tabletopStroke: '#8c6438',
  leg: '#888',
  legHole: '#555',
  beam: '#b8b8b8',
  beamDashed: '#999',
  dimension: '#666',
  grid: '#222',
  text: '#aaa',
  label: '#ccc',
};

const TabletopPlan: React.FC = () => {
  const model = useModelStore((s) => s.model);

  // Extract parameters
  const width = model?.parameters.find((p) => p.id === 'width')?.value ?? 1200;
  const depth = model?.parameters.find((p) => p.id === 'depth')?.value ?? 600;
  const thickness = model?.parameters.find((p) => p.id === 'tabletop_thickness')?.value ?? 18;

  // Compute mount points from component poses (URDF absolute positions)
  const { legPoints, beamLines, beamCenters } = useMemo(() => {
    if (!model) return { legPoints: [], beamLines: [], beamCenters: [] };

    const legs: MountPoint[] = [];
    const beams: { name: string; x: number; y: number }[] = [];
    const lines: { name: string; x1: number; y1: number; x2: number; y2: number }[] = [];

    // Collect leg and beam positions from URDF poses
    for (const comp of model.components) {
      if (!comp.pose || !comp.visible) continue;

      if (comp.partType === 'leg') {
        legs.push({
          name: comp.name,
          x: comp.pose.x,
          y: comp.pose.y,
          type: 'leg',
        });
      } else if (comp.partType === 'beam') {
        beams.push({
          name: comp.name,
          x: comp.pose.x,
          y: comp.pose.y,
        });
      }
    }

    // Build beam lines: connect beams of the same type along edges
    // beam_front + beam_back: horizontal beams connecting front/back legs
    // beam_left + beam_right: vertical beams connecting left/right legs
    const frontLegs = legs.filter((l) => l.name.includes('front'));
    const backLegs = legs.filter((l) => l.name.includes('back'));
    const leftLegs = legs.filter((l) => l.name.includes('left'));
    const rightLegs = legs.filter((l) => l.name.includes('right'));

    // Front beam: connects front-left to front-right leg
    if (frontLegs.length >= 2) {
      lines.push({
        name: 'beam_front',
        x1: frontLegs[0].x,
        y1: frontLegs[0].y,
        x2: frontLegs[1].x,
        y2: frontLegs[1].y,
      });
    }

    // Back beam
    if (backLegs.length >= 2) {
      lines.push({
        name: 'beam_back',
        x1: backLegs[0].x,
        y1: backLegs[0].y,
        x2: backLegs[1].x,
        y2: backLegs[1].y,
      });
    }

    // Left beam
    if (leftLegs.length >= 2) {
      lines.push({
        name: 'beam_left',
        x1: leftLegs[0].x,
        y1: leftLegs[0].y,
        x2: leftLegs[1].x,
        y2: leftLegs[1].y,
      });
    }

    // Right beam
    if (rightLegs.length >= 2) {
      lines.push({
        name: 'beam_right',
        x1: rightLegs[0].x,
        y1: rightLegs[0].y,
        x2: rightLegs[1].x,
        y2: rightLegs[1].y,
      });
    }

    return {
      legPoints: legs,
      beamLines: lines,
      beamCenters: beams,
    };
  }, [model]);

  if (!model) return null;

  // SVG dimensions: add padding around the tabletop
  const padding = 100; // mm
  const halfW = width / 2;
  const halfD = depth / 2;
  const svgW = width + padding * 2;
  const svgH = depth + padding * 2;

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 flex-shrink-0">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Tabletop Plan
        </p>
        <p className="text-sm text-neutral-400 mt-0.5">
          {width}×{depth}×{thickness} mm
        </p>
      </div>

      {/* SVG Plan View */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <svg
          viewBox={`${-svgW / 2} ${-svgH / 2} ${svgW} ${svgH}`}
          className="w-full h-full max-w-md max-h-md"
          style={{ background: '#14141e' }}
        >
          {/* Grid */}
          <defs>
            <pattern
              id="planGrid"
              width="100"
              height="100"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 100 0 L 0 0 0 100"
                fill="none"
                stroke={COLORS.grid}
                strokeWidth="0.5"
              />
            </pattern>
            <pattern
              id="planGridLarge"
              width="500"
              height="500"
              patternUnits="userSpaceOnUse"
            >
              <rect width="500" height="500" fill="url(#planGrid)" />
              <path
                d="M 500 0 L 0 0 0 500"
                fill="none"
                stroke={COLORS.grid}
                strokeWidth="1.5"
              />
            </pattern>
          </defs>
          <rect
            x={-svgW / 2}
            y={-svgH / 2}
            width={svgW}
            height={svgH}
            fill="url(#planGridLarge)"
          />

          {/* Tabletop surface */}
          <rect
            x={-halfW}
            y={-halfD}
            width={width}
            height={depth}
            rx="2"
            fill={COLORS.tabletop}
            fillOpacity="0.3"
            stroke={COLORS.tabletopStroke}
            strokeWidth="2"
          />

          {/* Tabletop center cross */}
          <line
            x1={-halfW - 20}
            y1={0}
            x2={halfW + 20}
            y2={0}
            stroke={COLORS.tabletopStroke}
            strokeWidth="0.5"
            strokeDasharray="8 4"
          />
          <line
            x1={0}
            y1={-halfD - 20}
            x2={0}
            y2={halfD + 20}
            stroke={COLORS.tabletopStroke}
            strokeWidth="0.5"
            strokeDasharray="8 4"
          />

          {/* Beam lines (dashed, under the tabletop) */}
          {beamLines.map((line) => (
            <line
              key={line.name}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={COLORS.beamDashed}
              strokeWidth="3"
              strokeDasharray="6 3"
              opacity="0.6"
            />
          ))}

          {/* Beam labels */}
          {beamCenters.map((beam) => (
            <g key={beam.name}>
              <rect
                x={beam.x - 15}
                y={beam.y - 7}
                width="30"
                height="14"
                rx="3"
                fill="#1a1a2e"
                fillOpacity="0.8"
              />
              <text
                x={beam.x}
                y={beam.y + 4}
                textAnchor="middle"
                fontSize="6"
                fill={COLORS.text}
              >
                {beam.name.replace('beam_', '')}
              </text>
            </g>
          ))}

          {/* Leg mounting points */}
          {legPoints.map((leg) => (
            <g key={leg.name}>
              {/* Outer ring */}
              <circle
                cx={leg.x}
                cy={leg.y}
                r="18"
                fill="none"
                stroke={COLORS.leg}
                strokeWidth="1"
                opacity="0.6"
              />
              {/* Inner hole */}
              <circle
                cx={leg.x}
                cy={leg.y}
                r="12"
                fill={COLORS.legHole}
                stroke={COLORS.leg}
                strokeWidth="0.5"
              />
              {/* Center dot */}
              <circle
                cx={leg.x}
                cy={leg.y}
                r="2"
                fill={COLORS.label}
              />
              {/* Label */}
              <text
                x={leg.x}
                y={leg.y - 22}
                textAnchor="middle"
                fontSize="7"
                fill={COLORS.label}
              >
                {leg.name.replace('leg_', '')}
              </text>
            </g>
          ))}

          {/* Dimension lines — Width */}
          <DimensionLine
            x1={-halfW}
            y1={halfD + 30}
            x2={halfW}
            y2={halfD + 30}
            label={`${width} mm`}
            color={COLORS.dimension}
          />

          {/* Dimension lines — Depth */}
          <DimensionLine
            x1={-halfW - 30}
            y1={-halfD}
            x2={-halfW - 30}
            y2={halfD}
            label={`${depth} mm`}
            color={COLORS.dimension}
            vertical
          />

          {/* Thickness note */}
          <text
            x={0}
            y={-halfD - 40}
            textAnchor="middle"
            fontSize="8"
            fill={COLORS.text}
          >
            Thickness: {thickness} mm
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-neutral-800 flex-shrink-0">
        <div className="flex flex-wrap gap-3 text-[10px] text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-wood-400/30 border border-wood-600" /> Surface
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-neutral-700 border border-neutral-500" /> Leg
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 border-t border-dashed border-neutral-400" /> Beam
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Dimension line helper
// ============================================================

const DimensionLine: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  color: string;
  vertical?: boolean;
}> = ({ x1, y1, x2, y2, label, color, vertical }) => {
  const tickLen = 8;
  const offset = 10;

  return (
    <g>
      {/* Main line */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.8" />

      {/* Tick marks */}
      {vertical ? (
        <>
          <line x1={x1 - tickLen} y1={y1} x2={x1 + tickLen} y2={y1} stroke={color} strokeWidth="0.8" />
          <line x1={x2 - tickLen} y1={y2} x2={x2 + tickLen} y2={y2} stroke={color} strokeWidth="0.8" />
          {/* Extension lines */}
          <line x1={x1} y1={y1} x2={x1} y2={y1 - offset} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
          <line x1={x1} y1={y2} x2={x1} y2={y2 + offset} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
          {/* Label */}
          <text
            x={x1 - 18}
            y={(y1 + y2) / 2}
            textAnchor="middle"
            fontSize="7"
            fill={color}
            transform={`rotate(-90, ${x1 - 18}, ${(y1 + y2) / 2})`}
          >
            {label}
          </text>
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tickLen} x2={x1} y2={y1 + tickLen} stroke={color} strokeWidth="0.8" />
          <line x1={x2} y1={y2 - tickLen} x2={x2} y2={y2 + tickLen} stroke={color} strokeWidth="0.8" />
          {/* Extension lines */}
          <line x1={x1} y1={y1} x2={x1 + offset} y2={y1} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
          <line x1={x2} y1={y2} x2={x2 - offset} y2={y2} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
          {/* Label */}
          <text
            x={(x1 + x2) / 2}
            y={y1 + 16}
            textAnchor="middle"
            fontSize="7"
            fill={color}
          >
            {label}
          </text>
        </>
      )}
    </g>
  );
};

export default TabletopPlan;
