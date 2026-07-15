import { useState, useCallback, useRef, useMemo } from 'react';
import { useModelStore } from '../store/modelStore';
import type { TabletopHole } from '../types/furniture';

/**
 * 2D top-down plan view of the tabletop with zoom/pan, hole editing,
 * DXF export, and precision positioning tools.
 *
 * Interactions:
 *   - Scroll wheel: zoom in/out (around cursor)
 *   - Left drag (on empty area): pan
 *   - Double-click (on tabletop): add a hole at cursor (snapped to grid)
 *   - Drag hole: move it (snapped to grid)
 *   - Click hole → select → shows coordinate panel + edge distances + alignment guides
 *   - Arrow keys: nudge selected hole (1mm / Shift+10mm)
 *   - +/- keys: resize selected hole
 *   - G key: toggle snap grid (off → 10mm → 50mm → off)
 *   - Delete/Backspace: remove selected hole
 *
 * Coordinate system: tabletop center at origin, X=right, Y=down (SVG).
 * All units in mm.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BeamLine {
  name: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

interface BeamCenter {
  name: string;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
  hole: '#ff6b6b',
  holeSelected: '#ff3333',
  edgeSafe: '#4ade80',
  edgeWarn: '#facc15',
  edgeDanger: '#ff4444',
  alignGuide: '#3b82f6',
  profileFill: '#6b7b8d',
  profileStroke: '#8899aa',
  profileSlot: '#3a4552',
};

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 0.1;
const EDGE_WARN_THRESHOLD = 50;
const ALIGN_TOLERANCE = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _holeIdCounter = 0;
function nextHoleId(): string {
  _holeIdCounter += 1;
  return `hole_${_holeIdCounter}`;
}

function snapTo(v: number, grid: number): number {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TabletopPlan: React.FC = () => {
  const model = useModelStore((s) => s.model);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const width = model?.parameters.find((p) => p.id === 'width')?.value ?? 1200;
  const depth = model?.parameters.find((p) => p.id === 'depth')?.value ?? 600;
  const thickness = model?.parameters.find((p) => p.id === 'tabletop_thickness')?.value ?? 18;
  // Derive profile size from profile string: "2020"→20, "3030"→30, "4040"→40
  const profileStr = useModelStore((s) => s.currentParams).profile;
  // "2020" → 20, "3030" → 30, "4040" → 40
  const profileSize = parseInt(profileStr.substring(0, 2)) || 30;

  const padding = 100;
  // SVG Y+ = down; solver Y+ = front. To match 3D view (where front
  // appears at bottom of viewport), we flip the Y axis for display.
  const toSvgY = (sy: number) => -sy;
  const fromSvgY = (vy: number) => -vy;

  const halfW = width / 2;
  const halfD = depth / 2;
  const svgW = width + padding * 2;
  const svgH = depth + padding * 2;

  // ViewBox
  const [viewBox, setViewBox] = useState({ x: -svgW / 2, y: -svgH / 2, w: svgW, h: svgH });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vbX: 0, vbY: 0 });

  // Holes (shared store)
  const holes = useModelStore((s) => s.holes);
  const selectedHoleId = useModelStore((s) => s.selectedHoleId);
  const addHole = useModelStore((s) => s.addHole);
  const updateHole = useModelStore((s) => s.updateHole);
  const removeHole = useModelStore((s) => s.removeHole);
  const selectHole = useModelStore((s) => s.selectHole);

  const [draggingHoleId, setDraggingHoleId] = useState<string | null>(null);
  const [isAddingHole, setIsAddingHole] = useState(false);

  // Precision features
  const [snapGrid, setSnapGrid] = useState(0);
  const [panelX, setPanelX] = useState('');
  const [panelY, setPanelY] = useState('');
  const [panelR, setPanelR] = useState('');
  const [panelDirty, setPanelDirty] = useState(false);

  const selectedHole = holes.find((h) => h.id === selectedHoleId) ?? null;

  // ---- Coordinate mapping ----
  function svgPoint(e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    return {
      x: viewBox.x + (e.clientX - rect.left) * scaleX,
      y: viewBox.y + (e.clientY - rect.top) * scaleY,
    };
  }

  function svgToScreen(svgX: number, svgY: number): { left: number; top: number } {
    const svg = svgRef.current;
    if (!svg) return { left: 0, top: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / viewBox.w;
    const scaleY = rect.height / viewBox.h;
    // svgY is already in display coords (flipped from solver)
    return {
      left: (svgX - viewBox.x) * scaleX,
      top: (svgY - viewBox.y) * scaleY,
    };
  }

  // ---- Snap-aware add (x,y in SVG coords, convert to solver for storage) ----
  const addHoleAt = useCallback((svgX: number, svgY: number) => {
    const sx = snapTo(svgX, snapGrid);
    const sy = snapTo(fromSvgY(svgY), snapGrid); // SVG → solver
    if (Math.abs(sx) <= halfW && Math.abs(sy) <= halfD) {
      addHole({ id: nextHoleId(), x: sx, y: sy, radius: 30, type: 'circle' });
    }
  }, [halfW, halfD, snapGrid, addHole, fromSvgY]);

  // ---- Pan ----
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 0 && !draggingHoleId) {
      const target = e.target as Element;
      if (!target.closest('[data-hole]')) {
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
      }
    }
  }, [viewBox.x, viewBox.y, draggingHoleId]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingHoleId && svgRef.current) {
      const pt = svgPoint(e);
      updateHole(draggingHoleId, { x: snapTo(pt.x, snapGrid), y: snapTo(fromSvgY(pt.y), snapGrid) });
      return;
    }
    if (isPanning) {
      const svg = svgRef.current;
      if (!svg) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      const scale = viewBox.w / svg.clientWidth;
      setViewBox((vb) => ({
        ...vb,
        x: panStart.current.vbX - dx * scale,
        y: panStart.current.vbY - dy * scale,
      }));
    }
  }, [isPanning, draggingHoleId, viewBox.w, snapGrid, updateHole]);

  const handleMouseUp = useCallback(() => { setIsPanning(false); setDraggingHoleId(null); }, []);

  // ---- Zoom ----
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svgPoint(e);
    const factor = 1 + ZOOM_STEP * (e.deltaY < 0 ? 1 : -1);
    const newW = viewBox.w / factor;
    const newH = viewBox.h / factor;
    if (newW < svgW / MAX_ZOOM || newW > svgW / MIN_ZOOM) return;
    setViewBox({
      x: pt.x - (pt.x - viewBox.x) * (newW / viewBox.w),
      y: pt.y - (pt.y - viewBox.y) * (newH / viewBox.h),
      w: newW, h: newH,
    });
  }, [viewBox]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    addHoleAt(svgPoint(e).x, svgPoint(e).y);
  }, [addHoleAt]);

  // ---- Hole selection with panel sync ----
  const selectHoleWithPanel = useCallback((id: string | null) => {
    selectHole(id);
    setPanelDirty(false);
    if (id) {
      const h = holes.find((hh) => hh.id === id);
      if (h) { setPanelX(h.x.toFixed(1)); setPanelY(h.y.toFixed(1)); setPanelR(String(h.radius)); }
    }
  }, [selectHole, holes]);

  const handleHoleMouseDown = useCallback((e: React.MouseEvent, holeId: string) => {
    e.stopPropagation();
    selectHoleWithPanel(holeId);
    setDraggingHoleId(holeId);
  }, [selectHoleWithPanel]);

  const handleHoleClick = useCallback((e: React.MouseEvent, holeId: string) => {
    e.stopPropagation();
    selectHoleWithPanel(selectedHoleId === holeId ? null : holeId);
  }, [selectHoleWithPanel, selectedHoleId]);

  // ---- Keyboard ----
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!selectedHoleId) return;
    const hole = holes.find((h) => h.id === selectedHoleId);
    if (!hole) return;
    const step = e.shiftKey ? 10 : 1;

    switch (e.key) {
      case 'ArrowUp':    e.preventDefault(); updateHole(selectedHoleId, { y: snapTo(hole.y - step, snapGrid) }); break;
      case 'ArrowDown':  e.preventDefault(); updateHole(selectedHoleId, { y: snapTo(hole.y + step, snapGrid) }); break;
      case 'ArrowLeft':  e.preventDefault(); updateHole(selectedHoleId, { x: snapTo(hole.x - step, snapGrid) }); break;
      case 'ArrowRight': e.preventDefault(); updateHole(selectedHoleId, { x: snapTo(hole.x + step, snapGrid) }); break;
      case 'Delete': case 'Backspace': removeHole(selectedHoleId); break;
      case 'Escape': selectHole(null); setIsAddingHole(false); break;
      case '+': case '=': updateHole(selectedHoleId, { radius: Math.min(hole.radius + 5, 200) }); break;
      case '-': updateHole(selectedHoleId, { radius: Math.max(hole.radius - 5, 10) }); break;
      case 'g': case 'G': e.preventDefault(); setSnapGrid((g) => (g === 0 ? 10 : g === 10 ? 50 : 0)); break;
    }
  }, [selectedHoleId, holes, snapGrid, updateHole, removeHole, selectHole]);

  // ---- Panel apply ----
  const handlePanelApply = useCallback(() => {
    const hole = holes.find((h) => h.id === selectedHoleId);
    if (!hole) return;
    const nx = panelX ? parseFloat(panelX) : hole.x;
    const ny = panelY ? parseFloat(panelY) : hole.y;
    const nr = panelR ? parseFloat(panelR) : hole.radius;
    if (!isNaN(nx) && !isNaN(ny) && !isNaN(nr)) {
      updateHole(selectedHoleId!, { x: nx, y: ny, radius: Math.max(5, Math.min(nr, 200)) });
    }
    setPanelDirty(false);
    selectHole(null);
  }, [selectedHoleId, holes, panelX, panelY, panelR, updateHole, selectHole]);

  // ---- Reset ----
  const resetView = useCallback(() => {
    setViewBox({ x: -svgW / 2, y: -svgH / 2, w: svgW, h: svgH });
  }, [svgW, svgH]);

  // ---- DXF Export ----
  const exportDxf = useCallback(() => {
    const lines: string[] = [];
    const p = (s: string) => lines.push(s);
    p('0'); p('SECTION'); p('2'); p('ENTITIES'); p('0');
    p('LWPOLYLINE'); p('8'); p('0'); p('90'); p('4'); p('70'); p('1');
    p('10'); p(`${-halfW}`); p('20'); p(`${-halfD}`);
    p('10'); p(`${halfW}`);  p('20'); p(`${-halfD}`);
    p('10'); p(`${halfW}`);  p('20'); p(`${halfD}`);
    p('10'); p(`${-halfW}`); p('20'); p(`${halfD}`); p('0');
    for (const hole of holes) {
      p('CIRCLE'); p('8'); p('holes');
      p('10'); p(`${hole.x}`); p('20'); p(`${hole.y}`);
      p('40'); p(`${hole.radius}`); p('0');
    }
    p('ENDSEC'); p('0'); p('EOF');
    const blob = new Blob([lines.join('\r\n')], { type: 'application/dxf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tabletop_${width}x${depth}.dxf`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [halfW, halfD, holes, width, depth]);

  // ---- Beam projections (match 3D view frame layout) ----
  const cp = useModelStore((s) => s.currentParams);
  const beamLines = useMemo(() => {
    if (!model) return [] as BeamLine[];
    const lines: BeamLine[] = [];

    // Same frame layout logic as ModelLoader ProceduralPart & computeFrameLayout
    const w = width;
    const d = depth;
    const ps = profileSize;
    const insetX = w * cp.insetRatioX;
    const insetZ = d * cp.insetRatioZ;
    const frameW = w - insetX * 2;
    const frameD = d - insetZ * 2;
    const longDim = Math.max(frameW, frameD);
    const shortDim = Math.min(frameW, frameD);
    const isLongFB = frameW >= frameD; // front/back are "wide" when width ≥ depth
    const fbLen = isLongFB ? longDim : shortDim - 2 * ps;  // front/back beam length
    const lrLen = isLongFB ? shortDim - 2 * ps : longDim;  // left/right beam length

    // Beam outer face flush to frame boundary
    const beamYf =  d / 2 - insetZ - ps / 2; // front/back beam Y offset
    const beamXl = -w / 2 + insetX + ps / 2; // left beam X offset
    const beamXr =  w / 2 - insetX - ps / 2; // right beam X offset

    // SVG Y+ = down, Three.js Z+ = toward viewer.
    // In 3D view the front beam (Z>0) appears at the *bottom* of the viewport,
    // the back beam (Z<0) at the *top*.  We negate solver-Y to match that:
    //   solver Y+ (front) → Plan Y- (top of SVG)
    //   solver Y- (back)  → Plan Y+ (bottom of SVG)
    // After this, Plan view and 3D view agree on front/back orientation.
    const flp = -1; // Y flip
    if (fbLen > 0) {
      lines.push({ name: 'beam_front', x1: -fbLen / 2, y1:  flp * beamYf, x2:  fbLen / 2, y2:  flp * beamYf });
      lines.push({ name: 'beam_back',  x1: -fbLen / 2, y1: -flp * beamYf, x2:  fbLen / 2, y2: -flp * beamYf });
    }
    if (lrLen > 0) {
      lines.push({ name: 'beam_left',  x1: beamXl, y1: flp * (-lrLen / 2), x2: beamXl, y2: flp * (lrLen / 2) });
      lines.push({ name: 'beam_right', x1: beamXr, y1: flp * (-lrLen / 2), x2: beamXr, y2: flp * (lrLen / 2) });
    }
    return lines;
  }, [model, width, depth, profileSize, cp.insetRatioX, cp.insetRatioZ]);

  // ---- Alignment guides ----
  const alignmentGuides = useMemo(() => {
    if (!selectedHole || holes.length < 2) return { xLines: [] as number[], yLines: [] as number[] };
    const xl: number[] = [], yl: number[] = [];
    for (const other of holes) {
      if (other.id === selectedHole.id) continue;
      if (Math.abs(other.x - selectedHole.x) < ALIGN_TOLERANCE) yl.push(other.y);
      if (Math.abs(other.y - selectedHole.y) < ALIGN_TOLERANCE) xl.push(other.x);
    }
    return { xLines: xl, yLines: yl };
  }, [holes, selectedHole]);

  // ---- Edge distances ----
  const edgeDist = useMemo(() => {
    if (!selectedHole) return null;
    return {
      left:   halfW + selectedHole.x - selectedHole.radius,
      right:  halfW - selectedHole.x - selectedHole.radius,
      top:    halfD + selectedHole.y - selectedHole.radius,
      bottom: halfD - selectedHole.y - selectedHole.radius,
    };
  }, [selectedHole, halfW, halfD]);

  if (!model) return null;

  const zoomPct = Math.round((svgW / viewBox.w) * 100);
  const gridLabel = snapGrid === 0 ? 'Off' : `${snapGrid}mm`;
  const panelScreen = selectedHole ? svgToScreen(selectedHole.x, toSvgY(selectedHole.y)) : null;

  return (
    <div className="flex flex-col h-full bg-neutral-950" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* ---- Header ---- */}
      <div className="px-4 py-3 border-b border-neutral-800 flex-shrink-0 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Tabletop Plan</p>
          <p className="text-sm text-neutral-400 mt-0.5">
            {width}×{depth}×{thickness} mm
            {holes.length > 0 && <span className="ml-2 text-neutral-500">— {holes.length} cutout{holes.length !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`px-2 py-1 text-[10px] rounded transition-colors cursor-pointer font-mono ${
              snapGrid > 0 ? 'bg-blue-800 text-blue-200' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
            onClick={() => setSnapGrid((g) => (g === 0 ? 10 : g === 10 ? 50 : 0))}
            title="Snap grid (G key)">
            Grid {gridLabel}
          </button>
          <span className="text-[10px] text-neutral-500 w-10 text-right">{zoomPct}%</span>
          <button className="px-2 py-1 text-[10px] text-neutral-400 bg-neutral-800 rounded hover:bg-neutral-700 transition-colors cursor-pointer"
            onClick={resetView}>Fit</button>
          <button className="px-2 py-1 text-[10px] text-neutral-400 bg-neutral-800 rounded hover:bg-neutral-700 transition-colors cursor-pointer"
            onClick={exportDxf}>Export DXF</button>
          <button className={`px-2 py-1 text-[10px] rounded transition-colors cursor-pointer ${
            isAddingHole ? 'bg-red-800 text-red-200' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
          }`} onClick={() => setIsAddingHole((v) => !v)}>+ Hole</button>
        </div>
      </div>

      {/* ---- SVG + Overlay ---- */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative"
        style={{ cursor: isPanning ? 'grabbing' : isAddingHole ? 'crosshair' : 'grab' }}>

        {/* Coordinate input panel (HTML overlay, fixed-size regardless of zoom) */}
        {selectedHole && panelScreen && (
          <div className="absolute z-20 bg-neutral-800/95 border border-neutral-600 rounded-lg px-3 py-2.5 shadow-xl backdrop-blur-sm"
            style={{
              left: Math.min(panelScreen.left + 20, (containerRef.current?.clientWidth ?? 400) - 170),
              top:  Math.max(panelScreen.top - 60, 4),
            }}>
            <div className="flex items-center gap-2 text-[11px]">
              <label className="text-neutral-400 w-3">X</label>
              <input className="w-16 px-1.5 py-0.5 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 font-mono text-[10px] focus:outline-none focus:border-blue-500"
                value={panelX} onChange={(ev) => { setPanelX(ev.target.value); setPanelDirty(true); }}
                onKeyDown={(ev) => ev.key === 'Enter' && handlePanelApply()} />
              <span className="text-neutral-600">mm</span>
              <label className="text-neutral-400 w-3 ml-1">Y</label>
              <input className="w-16 px-1.5 py-0.5 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 font-mono text-[10px] focus:outline-none focus:border-blue-500"
                value={panelY} onChange={(ev) => { setPanelY(ev.target.value); setPanelDirty(true); }}
                onKeyDown={(ev) => ev.key === 'Enter' && handlePanelApply()} />
              <span className="text-neutral-600">mm</span>
              <label className="text-neutral-400 w-3 ml-1">Ø</label>
              <input className="w-12 px-1.5 py-0.5 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 font-mono text-[10px] focus:outline-none focus:border-blue-500"
                value={panelR} onChange={(ev) => { setPanelR(ev.target.value); setPanelDirty(true); }}
                onKeyDown={(ev) => ev.key === 'Enter' && handlePanelApply()} />
              <span className="text-neutral-600">mm</span>
              <button className="ml-1 px-2 py-0.5 bg-blue-700 hover:bg-blue-600 text-blue-100 rounded text-[10px] transition-colors cursor-pointer"
                onClick={handlePanelApply}>OK</button>
            </div>
          </div>
        )}

        <svg ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="w-full h-full" style={{ background: '#14141e' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onWheel={handleWheel} onDoubleClick={handleDoubleClick}>
          <defs>
            <pattern id="planGrid" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke={COLORS.grid} strokeWidth="0.5" />
            </pattern>
            <pattern id="planGridLarge" width="500" height="500" patternUnits="userSpaceOnUse">
              <rect width="500" height="500" fill="url(#planGrid)" />
              <path d="M 500 0 L 0 0 0 500" fill="none" stroke={COLORS.grid} strokeWidth="1.5" />
            </pattern>
            {snapGrid > 0 && (
              <pattern id="snapDots" width={snapGrid} height={snapGrid} patternUnits="userSpaceOnUse">
                <circle cx="0" cy="0" r="0.8" fill="#4ade80" opacity="0.25" />
              </pattern>
            )}
          </defs>
          <rect x={-svgW / 2} y={-svgH / 2} width={svgW} height={svgH} fill="url(#planGridLarge)" />
          {snapGrid > 0 && (
            <rect x={-svgW / 2} y={-svgH / 2} width={svgW} height={svgH} fill="url(#snapDots)" />
          )}

          {/* Tabletop */}
          <rect x={-halfW} y={-halfD} width={width} height={depth} rx="2"
            fill={COLORS.tabletop} fillOpacity="0.3" stroke={COLORS.tabletopStroke} strokeWidth="2" />
          <line x1={-halfW - 20} y1={0} x2={halfW + 20} y2={0}
            stroke={COLORS.tabletopStroke} strokeWidth="0.5" strokeDasharray="8 4" />
          <line x1={0} y1={-halfD - 20} x2={0} y2={halfD + 20}
            stroke={COLORS.tabletopStroke} strokeWidth="0.5" strokeDasharray="8 4" />

          {/* Beam profiles — projected onto tabletop */}
          {beamLines.map((l) => {
            const dx = l.x2 - l.x1;
            const dy = l.y2 - l.y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1) return null;
            const ux = dx / len, uy = dy / len;
            const nx = -uy, ny = ux; // perpendicular
            const hw = profileSize / 2;
            const pts = [
              { x: l.x1 + nx * hw, y: l.y1 + ny * hw },
              { x: l.x2 + nx * hw, y: l.y2 + ny * hw },
              { x: l.x2 - nx * hw, y: l.y2 - ny * hw },
              { x: l.x1 - nx * hw, y: l.y1 - ny * hw },
            ];
            const d = `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y} L ${pts[3].x} ${pts[3].y} Z`;
            return (
              <g key={l.name}>
                {/* Beam projection band */}
                <path d={d} fill={COLORS.profileFill} fillOpacity="0.35" stroke={COLORS.profileStroke} strokeWidth="0.8" strokeOpacity="0.5" />
                {/* Centerline */}
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                  stroke={COLORS.profileStroke} strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4" />
                {/* Label */}
                <rect x={(l.x1 + l.x2) / 2 - 14} y={(l.y1 + l.y2) / 2 - 6} width="28" height="12" rx="3"
                  fill="#1a1a2e" fillOpacity="0.85" />
                <text x={(l.x1 + l.x2) / 2} y={(l.y1 + l.y2) / 2 + 4} textAnchor="middle"
                  fontSize="6" fill={COLORS.profileStroke}>{l.name.replace('beam_', '')}</text>
              </g>
            );
          })}


          {/* ---- Alignment guides ---- */}
          {selectedHole && alignmentGuides.xLines.map((ox, i) => (
            <line key={`ax-${i}`} x1={selectedHole.x} y1={toSvgY(selectedHole.y)} x2={ox} y2={toSvgY(selectedHole.y)}
              stroke={COLORS.alignGuide} strokeWidth="0.5" strokeDasharray="4 3" opacity="0.6" pointerEvents="none" />
          ))}
          {selectedHole && alignmentGuides.yLines.map((oy, i) => (
            <line key={`ay-${i}`} x1={selectedHole.x} y1={toSvgY(selectedHole.y)} x2={selectedHole.x} y2={toSvgY(oy)}
              stroke={COLORS.alignGuide} strokeWidth="0.5" strokeDasharray="4 3" opacity="0.6" pointerEvents="none" />
          ))}

          {/* ---- User holes (display: Y flipped to SVG coords) ---- */}
          {holes.map((hole) => {
            const isSelected = hole.id === selectedHoleId;
            const isDragging = hole.id === draggingHoleId;
            const hy = toSvgY(hole.y);
            const hr = hole.radius;
            return (
              <g key={hole.id} data-hole={hole.id}>
                <circle cx={hole.x} cy={hy} r={hr + 6}
                  fill="transparent" stroke="none"
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => handleHoleMouseDown(e, hole.id)}
                  onClick={(e) => handleHoleClick(e, hole.id)} />
                <circle cx={hole.x} cy={hy} r={hr}
                  fill={isSelected ? COLORS.holeSelected : COLORS.hole} fillOpacity={0.5}
                  stroke={isSelected ? COLORS.holeSelected : COLORS.hole}
                  strokeWidth={isSelected ? 2 : 1} pointerEvents="none" />
                {isSelected && (
                  <>
                    <line x1={hole.x - hr * 0.5} y1={hy} x2={hole.x + hr * 0.5} y2={hy}
                      stroke={COLORS.holeSelected} strokeWidth="0.5" pointerEvents="none" />
                    <line x1={hole.x} y1={hy - hr * 0.5} x2={hole.x} y2={hy + hr * 0.5}
                      stroke={COLORS.holeSelected} strokeWidth="0.5" pointerEvents="none" />
                    {edgeDist && <EdgeDistLabels hole={hole} dist={edgeDist} toSvgY={toSvgY} />}
                  </>
                )}
              </g>
            );
          })}

          {/* Dimensions */}
          <DimLine x1={-halfW} y1={halfD + 30} x2={halfW} y2={halfD + 30} label={`${width} mm`}
            color={COLORS.dimension} />
          <DimLine x1={-halfW - 30} y1={-halfD} x2={-halfW - 30} y2={halfD}
            label={`${depth} mm`} color={COLORS.dimension} vertical />
          <text x={0} y={-halfD - 40} textAnchor="middle" fontSize="8" fill={COLORS.text}>
            Thickness: {thickness} mm
          </text>
        </svg>
      </div>

      {/* ---- Footer ---- */}
      <div className="px-4 py-2 border-t border-neutral-800 flex-shrink-0 flex items-center justify-between">
        <div className="flex flex-wrap gap-3 text-[10px] text-neutral-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-wood-400/30 border border-wood-600" /> Surface</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#6b7b8d]/40 border border-[#8899aa]" /> Beam profile</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400/50 border border-red-400" /> Cutout</span>
          {snapGrid > 0 && <span className="flex items-center gap-1 text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Grid {snapGrid}mm</span>}
        </div>
        <div className="text-[10px] text-neutral-600">
          Arrows: nudge · G: grid · +/-: size · Del: remove · Enter: apply coords
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Aluminum extrusion profile cross-section (T-slot)
// ============================================================

/**
 * Draws the cross-section of an aluminum extrusion profile (e.g., 3030).
 * Shows the outer square, corner T-slot channels, and center bore.
 */
const ProfileCross: React.FC<{ cx: number; cy: number; size: number; fill: string; stroke: string }> =
({ cx, cy, size, fill, stroke }) => {
  const hs = size / 2;
  const slotW = size * 0.22;   // T-slot channel width
  const slotD = size * 0.18;   // T-slot depth from edge
  const boreR = size * 0.12;   // center bore radius

  return (
    <g>
      {/* Outer square */}
      <rect x={cx - hs} y={cy - hs} width={size} height={size}
        fill={fill} fillOpacity="0.4" stroke={stroke} strokeWidth="0.8" />

      {/* Four T-slot channels */}
      {/* Top */}
      <rect x={cx - slotW / 2} y={cy - hs} width={slotW} height={slotD}
        fill={COLORS.profileSlot} fillOpacity="0.7" />
      {/* Bottom */}
      <rect x={cx - slotW / 2} y={cy + hs - slotD} width={slotW} height={slotD}
        fill={COLORS.profileSlot} fillOpacity="0.7" />
      {/* Left */}
      <rect x={cx - hs} y={cy - slotW / 2} width={slotD} height={slotW}
        fill={COLORS.profileSlot} fillOpacity="0.7" />
      {/* Right */}
      <rect x={cx + hs - slotD} y={cy - slotW / 2} width={slotD} height={slotW}
        fill={COLORS.profileSlot} fillOpacity="0.7" />

      {/* Center bore */}
      <circle cx={cx} cy={cy} r={boreR}
        fill="none" stroke={stroke} strokeWidth="0.5" opacity="0.6" />
      <circle cx={cx} cy={cy} r="1" fill={stroke} opacity="0.8" />
    </g>
  );
};

// ============================================================
// Edge distance labels
// ============================================================

const EdgeDistLabels: React.FC<{ hole: TabletopHole; dist: { left: number; right: number; top: number; bottom: number }; toSvgY: (y: number) => number }> =
({ hole, dist: d, toSvgY }) => {
  const hy = toSvgY(hole.y);
  const items = [
    { v: d.left,   x: hole.x - hole.radius - 18, y: hy, label: `${Math.round(d.left)}` },
    { v: d.right,  x: hole.x + hole.radius + 18, y: hy, label: `${Math.round(d.right)}` },
    { v: d.top,    x: hole.x, y: hy - hole.radius - 18, label: `${Math.round(d.top)}` },
    { v: d.bottom, x: hole.x, y: hy + hole.radius + 18, label: `${Math.round(d.bottom)}` },
  ];
  return (
    <>
      {items.map((it, i) => {
        const c = it.v < EDGE_WARN_THRESHOLD ? COLORS.edgeDanger
          : it.v < EDGE_WARN_THRESHOLD * 2 ? COLORS.edgeWarn : COLORS.edgeSafe;
        const vert = i >= 2;
        return (
          <g key={i}>
            <line
              x1={vert ? hole.x : hole.x + (i === 0 ? -hole.radius : hole.radius)}
              y1={vert ? hole.y + (i === 2 ? -hole.radius : hole.radius) : hole.y}
              x2={it.x} y2={it.y} stroke={c} strokeWidth="0.5" strokeDasharray="2 2" pointerEvents="none" />
            <rect x={it.x - 14} y={it.y - 7} width="28" height="14" rx="3"
              fill="#1a1a2e" fillOpacity="0.9" stroke={c} strokeWidth="0.5" pointerEvents="none" />
            <text x={it.x} y={it.y + 4} textAnchor="middle" fontSize="7" fill={c}
              pointerEvents="none" fontFamily="monospace">{it.label}</text>
          </g>
        );
      })}
    </>
  );
};

// ============================================================
// Dimension line
// ============================================================

const DimLine: React.FC<{
  x1: number; y1: number; x2: number; y2: number;
  label: string; color: string; vertical?: boolean;
}> = ({ x1, y1, x2, y2, label, color, vertical }) => {
  const t = 8, o = 10;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.8" />
      {vertical ? (
        <>
          <line x1={x1 - t} y1={y1} x2={x1 + t} y2={y1} stroke={color} strokeWidth="0.8" />
          <line x1={x2 - t} y1={y2} x2={x2 + t} y2={y2} stroke={color} strokeWidth="0.8" />
          <line x1={x1} y1={y1} x2={x1} y2={y1 - o} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
          <line x1={x1} y1={y2} x2={x1} y2={y2 + o} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
          <text x={x1 - 18} y={(y1 + y2) / 2} textAnchor="middle" fontSize="7" fill={color}
            transform={`rotate(-90, ${x1 - 18}, ${(y1 + y2) / 2})`}>{label}</text>
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - t} x2={x1} y2={y1 + t} stroke={color} strokeWidth="0.8" />
          <line x1={x2} y1={y2 - t} x2={x2} y2={y2 + t} stroke={color} strokeWidth="0.8" />
          <line x1={x1} y1={y1} x2={x1 + o} y2={y1} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
          <line x1={x2} y1={y2} x2={x2 - o} y2={y2} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
          <text x={(x1 + x2) / 2} y={y1 + 16} textAnchor="middle" fontSize="7" fill={color}>{label}</text>
        </>
      )}
    </g>
  );
};

export default TabletopPlan;
