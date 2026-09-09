import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useModelStore, captureHoleSnapshot, commitHoleEdit } from '../store/modelStore';
import type { TabletopHole, HolePatch } from '../types/furniture';
import { DEFAULT_HOLE_SIZES, sampleHolePerimeterCCW, holeWorldBounds, holeFeaturePoints, nextHoleId } from '../utils/holeGeometry';
import { HOLE_TEMPLATES, templateFitReason, holesFitBoard, resolveTemplateHoles, type HoleTemplate } from '../utils/holeTemplates';

/**
 * 2D top-down plan view of the tabletop with zoom/pan, a mode toolbar
 * (select / add cutout shapes / measure), undo-redo for holes, retained
 * toggleable measure annotations and enhanced snapping.
 *
 * Coordinate system: solver frame, tabletop centre at origin, X right, Y front;
 * SVG flips Y so front appears at the top. All units mm.
 */

// ---------------------------------------------------------------------------
// Types / constants
// ---------------------------------------------------------------------------

type ToolId = 'select' | 'addCircle' | 'addRect' | 'addSlot' | 'measure';

interface BeamLine {
  name: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

const COLORS = {
  tabletop: '#d4a574',
  tabletopStroke: '#8c6438',
  dimension: '#666',
  grid: '#222',
  text: '#aaa',
  hole: '#ff6b6b',
  holeSelected: '#ff3333',
  edgeSafe: '#4ade80',
  edgeWarn: '#facc15',
  edgeDanger: '#ff4444',
  alignGuide: '#3b82f6',
  profileFill: '#6b7b8d',
  profileStroke: '#8899aa',
  ghost: '#ff9d9d',
  snapMarker: '#4ade80',
  measure: '#c4b5fd',
  annoSelected: '#fbbf24',
  snapEdge: '#22d3ee',
  snapAxis: '#f0abfc',
};

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 0.1;
const EDGE_WARN_THRESHOLD = 50;
const ALIGN_TOLERANCE = 2; // mm
const SNAP_TOLLERANCE_MM = 8; // magnet radius for geometry snapping

const TOOLS: { id: ToolId; label: string; title: string }[] = [
  { id: 'select', label: '选择', title: '选中/移动孔 · 拖动空白平移 · 单击空白取消' },
  { id: 'addCircle', label: '圆孔', title: '单击放置圆孔（可连续）· Esc 退出' },
  { id: 'addRect', label: '方孔', title: '单击放置方孔/圆角方孔（可连续）· Esc 退出' },
  { id: 'addSlot', label: '腰孔', title: '单击放置可旋转腰孔（可连续）· Esc 退出' },
  { id: 'measure', label: '测量', title: '吸附孔心/孔特征点/板边/角 → 水平垂直锁定 → 点第二点记录 · Esc 退出' },
];

let _annoId = 0;
function nextAnnoId(): string {
  _annoId += 1;
  return `anno_${_annoId}`;
}

/** Build a real default-size hole of the chosen type at board-frame (x,y). */
function makeDefaultHole(type: TabletopHole['type'], x: number, y: number): TabletopHole {
  if (type === 'circle') return { id: nextHoleId(), type, x, y, radius: DEFAULT_HOLE_SIZES.circle.radius };
  if (type === 'rect') return { id: nextHoleId(), type, x, y, ...DEFAULT_HOLE_SIZES.rect };
  return { id: nextHoleId(), type, x, y, ...DEFAULT_HOLE_SIZES.slot };
}

/** Throwaway hole for the ghost preview — does NOT touch the shared id counter. */
function ghostHole(type: TabletopHole['type'], x: number, y: number): TabletopHole {
  const g: Record<string, number | string> = { id: '__ghost__', type, x, y, angle: 0 };
  if (type === 'circle') g.radius = DEFAULT_HOLE_SIZES.circle.radius;
  else if (type === 'rect') {
    g.width = DEFAULT_HOLE_SIZES.rect.width;
    g.height = DEFAULT_HOLE_SIZES.rect.height;
    g.cornerRadius = DEFAULT_HOLE_SIZES.rect.cornerRadius;
  } else {
    g.length = DEFAULT_HOLE_SIZES.slot.length;
    g.width = DEFAULT_HOLE_SIZES.slot.width;
  }
  return g as unknown as TabletopHole;
}

function snapTo(v: number, grid: number): number {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

/** Grid + geometry magnet snapping. Returns world coords + whether magnetised. */
function snapPoint(
  x: number,
  y: number,
  opts: { snapGrid: number; holes: TabletopHole[]; width: number; depth: number; excludeId?: string; tol: number },
): { x: number; y: number; magnet: { x: number; y: number } | null } {
  const { snapGrid, holes, width, depth, excludeId, tol } = opts;
  const hw = width / 2;
  const hd = depth / 2;
  const candidates: { x: number; y: number }[] = [];
  for (const h of holes) if (h.id !== excludeId) candidates.push({ x: h.x, y: h.y });
  candidates.push({ x: 0, y: 0 });
  candidates.push({ x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd });
  candidates.push({ x: -hw, y: 0 }, { x: hw, y: 0 }, { x: 0, y: -hd }, { x: 0, y: hd });

  let best: { x: number; y: number; d: number } | null = null;
  for (const c of candidates) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d <= tol && (!best || d < best.d)) best = { ...c, d };
  }
  if (best) return { x: best.x, y: best.y, magnet: { x: best.x, y: best.y } };
  if (snapGrid > 0) return { x: snapTo(x, snapGrid), y: snapTo(y, snapGrid), magnet: null };
  return { x, y, magnet: null };
}

// ---------------------------------------------------------------------------
// Measure snapping (richer than the shared point/grid snap)
// ---------------------------------------------------------------------------

/** What a measure endpoint magnetised to. point = a discrete anchor (hole
 * centre/feature, board corner/…); edge = projected onto a tabletop edge line;
 * axis = locked onto the horizontal/vertical line through the start point (or
 * one of its intersections with a board edge / a feature column). */
type SnapKind = 'point' | 'edge' | 'axis';

interface MeasureSnapCtx {
  start: { x: number; y: number } | null;
  anchors: { x: number; y: number }[];
  width: number;
  depth: number;
  tol: number;
  snapGrid: number;
}

/**
 * Measure-specific endpoint snap. Unlike `snapPoint` (centres only) this also
 * magnetises onto tabletop edge lines, onto board-edge ∩ axis-lock points and,
 * while dragging a roughly horizontal/vertical segment, locks the free axis to
 * the start's row/column and snaps the other axis onto nearby feature columns.
 */
function measureSnapPoint(
  x: number,
  y: number,
  ctx: MeasureSnapCtx,
): { x: number; y: number; magnet: { x: number; y: number; kind: SnapKind } | null } {
  const { start, anchors, width, depth, tol, snapGrid } = ctx;
  const hw = width / 2;
  const hd = depth / 2;
  const cands: { x: number; y: number; kind: SnapKind; d: number }[] = [];
  const consider = (px: number, py: number, kind: SnapKind) => {
    cands.push({ x: px, y: py, kind, d: Math.hypot(px - x, py - y) });
  };

  // Discrete anchors: hole centres + feature points + board geometry.
  for (const a of anchors) consider(a.x, a.y, 'point');

  // Tabletop edge lines: project the cursor onto the four edges.
  const between = (v: number, a: number, b: number) => v >= Math.min(a, b) - 1e-6 && v <= Math.max(a, b) + 1e-6;
  for (const ey of [hd, -hd]) {
    if (Math.abs(y - ey) <= tol && between(x, -hw, hw)) consider(x, ey, 'edge');
  }
  for (const ex of [hw, -hw]) {
    if (Math.abs(x - ex) <= tol && between(y, -hd, hd)) consider(ex, y, 'edge');
  }

  // Rectilinear lock relative to the start point.
  if (start) {
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.abs(dy) <= tol) {
      consider(x, start.y, 'axis'); // pure horizontal lock (y = start.y)
      // Snap the endpoint's column to nearby feature columns on the same row.
      for (const a of anchors) if (Math.abs(a.y - start.y) <= tol) consider(a.x, start.y, 'axis');
      // Horizontal lock ∩ vertical board edges (ends on left/right edge at start.y).
      if (between(start.y, -hd, hd)) for (const ex of [hw, -hw]) consider(ex, start.y, 'axis');
    }
    if (Math.abs(dx) <= tol) {
      consider(start.x, y, 'axis'); // pure vertical lock (x = start.x)
      for (const a of anchors) if (Math.abs(a.x - start.x) <= tol) consider(start.x, a.y, 'axis');
      if (between(start.x, -hw, hw)) for (const ey of [hd, -hd]) consider(start.x, ey, 'axis');
    }
  }

  let best: { x: number; y: number; kind: SnapKind; d: number } | null = null;
  for (const c of cands) if (c.d <= tol && (!best || c.d < best.d)) best = c;
  if (best) return { x: best.x, y: best.y, magnet: { x: best.x, y: best.y, kind: best.kind } };
  if (snapGrid > 0) return { x: snapTo(x, snapGrid), y: snapTo(y, snapGrid), magnet: null };
  return { x, y, magnet: null };
}

/** The board + holes discrete anchors, rebuilt only when geometry changes. */
function buildMeasureAnchors(holes: TabletopHole[], width: number, depth: number): { x: number; y: number }[] {
  const a: { x: number; y: number }[] = [];
  for (const h of holes) {
    a.push({ x: h.x, y: h.y });
    for (const p of holeFeaturePoints(h)) a.push(p);
  }
  const hw = width / 2;
  const hd = depth / 2;
  a.push({ x: 0, y: 0 });
  a.push({ x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd });
  a.push({ x: -hw, y: 0 }, { x: hw, y: 0 }, { x: 0, y: -hd }, { x: 0, y: hd });
  return a;
}

/** SVG path data for a hole outline, in display coords (Y flipped). */
function holeSvgPathD(hole: TabletopHole, toSvgY: (y: number) => number): string {
  const pts = sampleHolePerimeterCCW(hole);
  if (pts.length === 0) return '';
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${toSvgY(p.y).toFixed(2)}`).join(' ');
  return `${d} Z`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TabletopPlan: React.FC = () => {
  const model = useModelStore((s) => s.model);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = model?.parameters.find((p) => p.id === 'width')?.value ?? 1200;
  const depth = model?.parameters.find((p) => p.id === 'depth')?.value ?? 600;
  const thickness = model?.parameters.find((p) => p.id === 'tabletop_thickness')?.value ?? 18;
  const cp = useModelStore((s) => s.currentParams);
  const profileSize = parseInt(cp.profile.substring(0, 2)) || 30;

  const padding = 100;
  const toSvgY = (sy: number) => -sy;
  const fromSvgY = (vy: number) => -vy;

  const halfW = width / 2;
  const halfD = depth / 2;
  const svgW = width + padding * 2;
  const svgH = depth + padding * 2;

  // ---- store state ----
  const holes = useModelStore((s) => s.holes);
  const selectedHoleId = useModelStore((s) => s.selectedHoleId);
  const annotations = useModelStore((s) => s.annotations);
  const annotationsVisible = useModelStore((s) => s.annotationsVisible);
  const canUndo = useModelStore((s) => s.holePast.length > 0);
  const canRedo = useModelStore((s) => s.holeFuture.length > 0);
  // Subscribe to the whole store (referentially stable between sets). A selector
  // returning a fresh object literal each snapshot is unstable for React's
  // useSyncExternalStore and triggers an infinite re-render loop.
  const actions = useModelStore();

  // ---- local view state ----
  const [viewBox, setViewBox] = useState({ x: -svgW / 2, y: -svgH / 2, w: svgW, h: svgH });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vbX: 0, vbY: 0 });
  const panMoved = useRef(false);
  const [draggingHoleId, setDraggingHoleId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('select');
  const [snapGrid, setSnapGrid] = useState(0);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [magnet, setMagnet] = useState<{ x: number; y: number; kind?: SnapKind } | null>(null);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureCur, setMeasureCur] = useState<{ x: number; y: number } | null>(null);
  // Attachment points of the hole currently hovered in measure mode.
  const [hoverAnchors, setHoverAnchors] = useState<{ id: string; pts: { x: number; y: number }[] } | null>(null);
  // Template-insert dropdown.
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!templateMenuOpen) return;
    const onDown = (ev: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(ev.target as Node)) setTemplateMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [templateMenuOpen]);
  const [rotatingHoleId, setRotatingHoleId] = useState<string | null>(null);
  const [annoSelectedId, setAnnoSelectedId] = useState<string | null>(null);
  // Captures history once per gesture; committed exactly once on pointer up/leave.
  const gestureBefore = useRef<ReturnType<typeof captureHoleSnapshot> | null>(null);

  const selectedHole = holes.find((h) => h.id === selectedHoleId) ?? null;

  // A template layout is "managed": its holes carry edge anchors, follow the board
  // when it is resized, and lock out manual hole-adding until the user detaches.
  const managed = holes.some((h) => h.anchorX || h.anchorY);

  // Discrete snap anchors for the measure tool (rebuilt only when geometry moves).
  const measureAnchors = useMemo(() => buildMeasureAnchors(holes, width, depth), [holes, width, depth]);

  // Per-hole geometry for the measure hover reveal: the axis-aligned bounds to
  // decide which hole the cursor is over, and the feature points (centre + four
  // axis extremes) it can attach to.
  const holeSnapGeo = useMemo(
    () => holes.map((h) => ({ id: h.id, b: holeWorldBounds(h), pts: holeFeaturePoints(h) })),
    [holes],
  );

  // ---- view helpers ----
  // True client → user conversion. The svg fills an arbitrary container while the
  // viewBox has a fixed aspect (svgW:svgH), so the browser preserves aspect by
  // scaling uniformly and centring (letterboxing). Rescaling each axis with its
  // own viewBox/clientWidth factor is therefore wrong off-centre — delegate to
  // the inverse screen CTM, which already encodes scale + centring + pan/zoom.
  const svgPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (svg && ctm) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }
    const rect = svg!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // Uniform px→user scale (SVG meets preserve aspect, so a === d). Used to keep
  // screen-constant tolerances / drag deltas correct regardless of container ratio.
  const userPerPx = useCallback(() => {
    const ctm = svgRef.current?.getScreenCTM();
    if (ctm && ctm.a !== 0) return 1 / ctm.a;
    const svg = svgRef.current;
    return svg ? viewBox.w / svg.clientWidth : 1;
  }, [viewBox.w]);

  // Screen-constant magnet tolerance expressed in world mm at the current zoom.
  const snapTolerance = useCallback(() => {
    return SNAP_TOLLERANCE_MM * userPerPx();
  }, [userPerPx]);

  const resetView = useCallback(() => {
    setViewBox({ x: -svgW / 2, y: -svgH / 2, w: svgW, h: svgH });
  }, [svgW, svgH]);

  const zoomTo = useCallback(
    (factor: number, cx: number, cy: number) => {
      setViewBox((vb) => {
        const newW = vb.w / factor;
        const newH = vb.h / factor;
        if (newW < svgW / MAX_ZOOM || newW > svgW / MIN_ZOOM) return vb;
        return {
          x: cx - (cx - vb.x) * (newW / vb.w),
          y: cy - (cy - vb.y) * (newH / vb.h),
          w: newW,
          h: newH,
        };
      });
    },
    [svgW, svgH],
  );

  // ---- beam projections (solver → display fold; front = +Y shown at top) ----
  const beamLines = useMemo(() => {
    if (!model) return [] as BeamLine[];
    const lines: BeamLine[] = [];
    const insetX = width * cp.insetRatioX;
    const insetZ = depth * cp.insetRatioZ;
    const frameW = width - insetX * 2;
    const frameD = depth - insetZ * 2;
    const longDim = Math.max(frameW, frameD);
    const shortDim = Math.min(frameW, frameD);
    const isLongFB = frameW >= frameD;
    const fbLen = isLongFB ? longDim : shortDim - 2 * profileSize;
    const lrLen = isLongFB ? shortDim - 2 * profileSize : longDim;
    const beamYf = depth / 2 - insetZ - profileSize / 2;
    const beamXl = -width / 2 + insetX + profileSize / 2;
    const beamXr = width / 2 - insetX - profileSize / 2;
    const flp = -1; // +Y (front) → display top
    if (fbLen > 0) {
      lines.push({ name: 'front', x1: -fbLen / 2, y1: flp * beamYf, x2: fbLen / 2, y2: flp * beamYf });
      lines.push({ name: 'back', x1: -fbLen / 2, y1: -flp * beamYf, x2: fbLen / 2, y2: -flp * beamYf });
    }
    if (lrLen > 0) {
      lines.push({ name: 'left', x1: beamXl, y1: flp * (-lrLen / 2), x2: beamXl, y2: flp * (lrLen / 2) });
      lines.push({ name: 'right', x1: beamXr, y1: flp * (-lrLen / 2), x2: beamXr, y2: flp * (lrLen / 2) });
    }
    return lines;
  }, [model, width, depth, profileSize, cp.insetRatioX, cp.insetRatioZ]);

  // ---- shape-aware helpers for the selected hole ----
  const selBox = selectedHole ? holeWorldBounds(selectedHole) : null;
  const edgeDist = selBox
    ? {
        left: halfW + selBox.minX,
        right: halfW - selBox.maxX,
        top: halfD - selBox.maxY, // display-top edge (front, +Y)
        bottom: halfD + selBox.minY,
      }
    : null;

  // ---- alignment guides (hole centres + board centre/edges) ----
  const alignmentGuides = useMemo(() => {
    if (!selectedHole) return { xLines: [] as number[], yLines: [] as number[] };
    const xl: number[] = [];
    const yl: number[] = [];
    for (const other of holes) {
      if (other.id === selectedHole.id) continue;
      if (Math.abs(other.y - selectedHole.y) < ALIGN_TOLERANCE) xl.push(other.x);
      if (Math.abs(other.x - selectedHole.x) < ALIGN_TOLERANCE) yl.push(other.y);
    }
    if (Math.abs(0 - selectedHole.x) < ALIGN_TOLERANCE) yl.push(0);
    if (Math.abs(-halfW - selectedHole.x) < ALIGN_TOLERANCE) yl.push(-halfW);
    if (Math.abs(halfW - selectedHole.x) < ALIGN_TOLERANCE) yl.push(halfW);
    if (Math.abs(0 - selectedHole.y) < ALIGN_TOLERANCE) xl.push(0);
    if (Math.abs(-halfD - selectedHole.y) < ALIGN_TOLERANCE) xl.push(-halfD);
    if (Math.abs(halfD - selectedHole.y) < ALIGN_TOLERANCE) xl.push(halfD);
    return { xLines: xl, yLines: yl };
  }, [selectedHole, holes, halfW, halfD]);

  const isAddTool = activeTool === 'addCircle' || activeTool === 'addRect' || activeTool === 'addSlot';

  // ---- history helpers ----
  const editHole = useCallback(
    (id: string, patch: HolePatch) => {
      const before = captureHoleSnapshot();
      actions.updateHole(id, patch);
      commitHoleEdit(before);
    },
    [actions],
  );

  const deleteHole = useCallback(
    (id: string) => {
      const before = captureHoleSnapshot();
      actions.removeHole(id);
      commitHoleEdit(before);
    },
    [actions],
  );

  const finishGesture = useCallback(() => {
    if (gestureBefore.current) {
      commitHoleEdit(gestureBefore.current);
      gestureBefore.current = null;
    }
  }, []);

  // ---- tool switching ----
  const switchTool = useCallback((t: ToolId) => {
    setActiveTool(t);
    setGhost(null);
    setMagnet(null);
    setMeasureStart(null);
    setMeasureCur(null);
    setHoverAnchors(null);
    setRotatingHoleId(null);
  }, []);

  // A template owns the board: one board holds exactly one template at a time.
  // Applying one therefore REPLACES whatever holes exist (manual or an earlier
  // template) — the whole swap is a single undo step. Runs from a fresh onClick,
  // so closing over this render's `holes` is safe.
  const applyTemplate = (tpl: HoleTemplate) => {
    setTemplateMenuOpen(false);
    if (templateFitReason(tpl, width, depth)) return; // greyed-out rows, double gate
    const produced = resolveTemplateHoles(tpl, width, depth);
    if (!holesFitBoard(produced, width, depth)) return; // defensive, before capture (no empty undo step)
    const before = captureHoleSnapshot();
    actions.setHoles(produced);
    actions.selectHole(null); // produced holes replace the old set — drop any stale selection
    commitHoleEdit(before);
    switchTool('select');
  };

  // ---- pointer handlers (single listener on <svg>) ----
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const pt = svgPoint(e);
      const sx = pt.x;
      const sy = fromSvgY(pt.y);
      const target = e.target as Element;
      const tol = snapTolerance();

      if (activeTool === 'measure') {
        const snapped = measureSnapPoint(sx, sy, {
          start: measureStart, anchors: measureAnchors, width, depth, tol, snapGrid,
        });
        setMagnet(snapped.magnet);
        if (measureStart) {
          const d = Math.hypot(snapped.x - measureStart.x, snapped.y - measureStart.y);
          if (d > 0.5) {
            actions.addAnnotation({ id: nextAnnoId(), x1: measureStart.x, y1: measureStart.y, x2: snapped.x, y2: snapped.y });
            setAnnoSelectedId(null);
          }
          setMeasureStart(null);
          setMeasureCur(null);
        } else {
          setMeasureStart({ x: snapped.x, y: snapped.y });
          setMeasureCur({ x: snapped.x, y: snapped.y });
        }
        return;
      }

      if (isAddTool) {
        if (managed) {
          // Template locked — leave any lingering add mode and ignore the click.
          switchTool('select');
          return;
        }
        // Place a default-size hole at the snapped point (ignore existing overlays).
        const snapped = snapPoint(sx, sy, { snapGrid, holes, width, depth, tol });
        const inBoard = Math.abs(snapped.x) <= halfW && Math.abs(snapped.y) <= halfD;
        if (inBoard) {
          const before = captureHoleSnapshot();
          actions.addHole(makeDefaultHole(activeTool.slice(3).toLowerCase() as TabletopHole['type'], snapped.x, snapped.y));
          commitHoleEdit(before);
        }
        return;
      }

      // --- select tool ---
      if (target.closest('[data-rot-handle]')) {
        const hId = target.closest('[data-rot-handle]')!.getAttribute('data-hole-id');
        if (hId) {
          gestureBefore.current = captureHoleSnapshot();
          setRotatingHoleId(hId);
        }
        return;
      }
      if (annotationsVisible && target.closest('[data-anno]')) {
        const aid = target.closest('[data-anno]')!.getAttribute('data-anno-id');
        if (aid) {
          // Selecting an annotation is an editing target — leave hole-edit mode.
          actions.selectHole(null);
          setAnnoSelectedId(aid === annoSelectedId ? null : aid);
        }
        return;
      }
      if (target.closest('[data-hole]')) {
        const hId = target.closest('[data-hole]')!.getAttribute('data-hole');
        if (hId) {
          setAnnoSelectedId(null);
          if (selectedHoleId !== hId) actions.selectHole(hId);
          setDraggingHoleId(hId);
          gestureBefore.current = captureHoleSnapshot();
        }
        return;
      }
      // Empty click or potential pan.
      setIsPanning(true);
      panMoved.current = false;
      panStart.current = { x: e.clientX, y: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
    },
    [activeTool, isAddTool, managed, switchTool, snapGrid, holes, width, depth, snapTolerance, svgPoint, measureStart, measureAnchors, halfW, halfD, actions, viewBox.x, viewBox.y, annotationsVisible, annoSelectedId, selectedHoleId],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = svgPoint(e);
      const sx = pt.x;
      const sy = fromSvgY(pt.y);
      const tol = snapTolerance();

      // Ghost preview + magnet for add tools.
      if (isAddTool) {
        const snapped = snapPoint(sx, sy, { snapGrid, holes, width, depth, tol });
        setGhost({ x: snapped.x, y: snapped.y });
        setMagnet(snapped.magnet);
        return;
      }
      if (activeTool === 'measure') {
        const snapped = measureSnapPoint(sx, sy, {
          start: measureStart, anchors: measureAnchors, width, depth, tol, snapGrid,
        });
        setMagnet(snapped.magnet);
        if (measureStart) setMeasureCur({ x: snapped.x, y: snapped.y });
        // Reveal the attach points of the hole under the cursor (bounds grown by
        // one snap tolerance), so the user can see what a shape offers before
        // clicking; nearest hole centre wins when bounds overlap.
        let hit: { id: string; pts: { x: number; y: number }[] } | null = null;
        let best = Infinity;
        for (const g of holeSnapGeo) {
          const m = tol;
          const b = g.b;
          if (sx >= b.minX - m && sx <= b.maxX + m && sy >= b.minY - m && sy <= b.maxY + m) {
            const dc = Math.hypot(sx - (b.minX + b.maxX) / 2, sy - (b.minY + b.maxY) / 2);
            if (dc < best) {
              best = dc;
              hit = { id: g.id, pts: g.pts };
            }
          }
        }
        setHoverAnchors(hit);
        return;
      }

      // Rotate handle drag (rect/slot). 15° snap unless Shift held.
      if (rotatingHoleId) {
        const hole = holes.find((h) => h.id === rotatingHoleId);
        if (hole) {
          let deg = (Math.atan2(sy - hole.y, sx - hole.x) * 180) / Math.PI;
          if (!e.shiftKey) deg = Math.round(deg / 15) * 15;
          actions.updateHole(rotatingHoleId, { angle: deg });
        }
        return;
      }

      // Hole drag.
      if (draggingHoleId) {
        const snapped = snapPoint(sx, sy, {
          snapGrid, holes, width, depth, excludeId: draggingHoleId, tol,
        });
        actions.updateHole(draggingHoleId, { x: snapped.x, y: snapped.y });
        setMagnet(snapped.magnet);
        return;
      }

      // Pan.
      if (isPanning) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        if (!panMoved.current && Math.hypot(dx, dy) > 3) panMoved.current = true;
        if (panMoved.current) {
          const scale = userPerPx();
          setViewBox((vb) => ({
            ...vb,
            x: panStart.current.vbX - dx * scale,
            y: panStart.current.vbY - dy * scale,
          }));
        }
      }
    },
    [isAddTool, activeTool, measureStart, measureAnchors, holeSnapGeo, rotatingHoleId, draggingHoleId, isPanning, holes, snapGrid, width, depth, snapTolerance, svgPoint, userPerPx, actions],
  );

  const handleMouseUp = useCallback(() => {
    const wasClick = isPanning && !panMoved.current;
    setIsPanning(false);
    setDraggingHoleId(null);
    setRotatingHoleId(null);
    finishGesture();
    if (wasClick) {
      // A plain click on empty space deselects (returns the right product panel).
      actions.selectHole(null);
      setAnnoSelectedId(null);
    }
  }, [isPanning, actions, finishGesture]);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    setDraggingHoleId(null);
    setRotatingHoleId(null);
    finishGesture();
    setGhost(null);
    setMagnet(null);
    if (activeTool !== 'measure') setMeasureCur(null);
  }, [activeTool, finishGesture]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const pt = svgPoint(e);
      const factor = 1 + ZOOM_STEP * (e.deltaY < 0 ? 1 : -1);
      zoomTo(factor, pt.x, pt.y);
    },
    [svgPoint, zoomTo],
  );

  // ---- resize primary size on +/- ----
  const stepPrimarySize = useCallback(
    (dir: 1 | -1) => {
      if (!selectedHoleId || !selectedHole) return;
      const before = captureHoleSnapshot();
      if (selectedHole.type === 'circle') {
        actions.updateHole(selectedHoleId, { radius: Math.max(5, Math.min(selectedHole.radius + dir * 5, 200)) });
      } else if (selectedHole.type === 'rect') {
        actions.updateHole(selectedHoleId, {
          width: Math.max(5, selectedHole.width + dir * 5),
          height: Math.max(5, selectedHole.height + dir * 5),
        });
      } else {
        actions.updateHole(selectedHoleId, { length: Math.max(10, selectedHole.length + dir * 5) });
      }
      commitHoleEdit(before);
    },
    [selectedHoleId, selectedHole, actions],
  );

  // ---- keyboard ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (templateMenuOpen) {
          setTemplateMenuOpen(false);
          return;
        }
        if (isAddTool || activeTool === 'measure') switchTool('select');
        else if (measureStart) {
          setMeasureStart(null);
          setMeasureCur(null);
        } else if (annoSelectedId) setAnnoSelectedId(null);
        else actions.selectHole(null);
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setSnapGrid((g) => (g === 0 ? 10 : g === 10 ? 50 : 0));
        return;
      }
      // Undo / redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) actions.redoHoles();
        else actions.undoHoles();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        actions.redoHoles();
        return;
      }

      // Delete prefers a selected hole, else the selected annotation.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedHoleId) {
          e.preventDefault();
          deleteHole(selectedHoleId);
        } else if (annoSelectedId) {
          e.preventDefault();
          actions.removeAnnotation(annoSelectedId);
          setAnnoSelectedId(null);
        }
        return;
      }
      if (!selectedHoleId || !selectedHole) return;

      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); editHole(selectedHoleId, { y: selectedHole.y + step }); break;
        case 'ArrowDown': e.preventDefault(); editHole(selectedHoleId, { y: selectedHole.y - step }); break;
        case 'ArrowLeft': e.preventDefault(); editHole(selectedHoleId, { x: selectedHole.x - step }); break;
        case 'ArrowRight': e.preventDefault(); editHole(selectedHoleId, { x: selectedHole.x + step }); break;
        case '+': case '=': e.preventDefault(); stepPrimarySize(1); break;
        case '-': e.preventDefault(); stepPrimarySize(-1); break;
        case 'r': case 'R': {
          if (selectedHole.type !== 'circle') {
            e.preventDefault();
            editHole(selectedHoleId, { angle: ((selectedHole.angle ?? 0) + (e.shiftKey ? 5 : 15)) % 360 });
          }
          break;
        }
      }
    },
    [isAddTool, activeTool, templateMenuOpen, measureStart, annoSelectedId, selectedHoleId, selectedHole, actions, deleteHole, editHole, stepPrimarySize, switchTool],
  );

  if (!model) return null;

  const zoomPct = Math.round((svgW / viewBox.w) * 100);
  const gridLabel = snapGrid === 0 ? 'Off' : `${snapGrid}mm`;
  const cursor = isPanning ? 'grabbing' : isAddTool || activeTool === 'measure' ? 'crosshair' : 'default';

  // Rotate-handle world point (local (0, +halfTop)) for rect/slot.
  let rotHandlePt: { x: number; y: number } | null = null;
  if (selectedHole && selectedHole.type !== 'circle' && activeTool === 'select') {
    const halfTop = selectedHole.type === 'rect' ? selectedHole.height / 2 : selectedHole.width / 2;
    const θ = ((selectedHole.angle ?? 0) * Math.PI) / 180;
    const lx = -halfTop * Math.sin(θ);
    const ly = halfTop * Math.cos(θ);
    rotHandlePt = { x: selectedHole.x + lx, y: selectedHole.y + ly };
  }

  return (
    <div
      className="flex flex-col h-full bg-neutral-950"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.currentTarget.focus({ preventScroll: true })}
    >
      {/* ---- Toolbar ---- */}
      <div className="px-3 py-2 border-b border-neutral-800 flex-shrink-0 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">平面图</p>
          <p className="text-sm text-neutral-400 font-mono">
            {width}×{depth}×{thickness}
            <span className="text-neutral-600 text-xs ml-1.5">{holes.length} 孔</span>
            {managed && (
              <span className="ml-1.5 text-[10px] text-amber-200/80 bg-amber-500/10 border border-amber-500/30 rounded px-1 py-px align-middle">
                模板
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center rounded-md bg-neutral-900 border border-neutral-800 p-0.5">
          {TOOLS.map((t) => {
            const isAdd = t.id.startsWith('add');
            const locked = managed && isAdd;
            return (
              <button
                key={t.id}
                title={locked ? '模板已锁定：需手动加孔请先转为自由副本或删除孔' : t.title}
                disabled={locked}
                onClick={() => switchTool(t.id)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  locked
                    ? 'text-neutral-600 cursor-not-allowed'
                    : activeTool === t.id
                      ? 'bg-wood-600 text-white'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer'
                }`}
              >
                {t.label}
                {locked && <span className="ml-1 text-[9px]">🔒</span>}
              </button>
            );
          })}
        </div>

        <div className="relative" ref={templateMenuRef}>
          <button
            aria-haspopup="menu"
            aria-expanded={templateMenuOpen}
            onClick={() => setTemplateMenuOpen((v) => !v)}
            title={managed ? '模板已锁定：孔随桌板尺寸自适应 · 可替换模板或转为自由副本' : '插入预设开孔模板'}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer border ${
              templateMenuOpen
                ? 'bg-wood-600 text-white border-wood-700'
                : managed
                  ? 'bg-amber-500/10 text-amber-200 border-amber-500/40 hover:bg-amber-500/20'
                  : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:border-neutral-600 hover:text-white'
            }`}
          >
            {managed ? '模板 ✓' : '模板'} <span className="text-[10px] opacity-70">▼</span>
          </button>
          {templateMenuOpen && (
            <div
              role="menu"
              className="absolute top-full mt-1 left-0 w-80 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-[100] overflow-hidden"
            >
              {managed && (
                <div className="px-3 py-2 border-b border-neutral-800 bg-neutral-800/40">
                  <div className="text-[11px] text-amber-200/90">模板已锁定 · 一块板仅一套</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5 leading-snug">
                    {holes.length} 个孔随桌板尺寸自适应 · 手动开孔已关闭
                  </div>
                </div>
              )}
              {HOLE_TEMPLATES.map((t) => {
                const reason = templateFitReason(t, width, depth);
                return (
                  <button
                    key={t.id}
                    role="menuitem"
                    disabled={!!reason}
                    onClick={() => applyTemplate(t)}
                    title={reason ? undefined : t.description}
                    className="w-full px-3 py-2.5 text-left hover:bg-neutral-800 transition-colors flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-neutral-900 cursor-pointer"
                  >
                    <span className="text-white text-sm">{t.name}</span>
                    <span className="text-neutral-500 text-[11px]">{reason ?? t.description}</span>
                  </button>
                );
              })}
              {managed ? (
                <>
                  <div className="border-t border-neutral-800" />
                  <button
                    role="menuitem"
                    onClick={() => {
                      actions.detachAnchors();
                      setTemplateMenuOpen(false);
                    }}
                    title="解除模板锁定：当前孔变成普通可编辑孔，之后可自由手动加孔"
                    className="w-full px-3 py-2.5 text-left hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer text-red-300"
                  >
                    <span>✂ 转为自由副本（脱离模板）</span>
                  </button>
                </>
              ) : holes.length > 0 ? (
                <div className="px-3 pb-2 pt-1.5 text-[10px] text-neutral-600 border-t border-neutral-800">
                  套用会先清空当前已布孔（一步可撤销）
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            disabled={!canUndo}
            onClick={() => actions.undoHoles()}
            title="撤销 (Ctrl+Z)"
            className="px-2 py-1 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            ↩ 撤销
          </button>
          <button
            disabled={!canRedo}
            onClick={() => actions.redoHoles()}
            title="重做 (Ctrl+Shift+Z)"
            className="px-2 py-1 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            ↪ 重做
          </button>
          <button
            onClick={() => actions.setAnnotationsVisible(!annotationsVisible)}
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              annotations.length > 0
                ? annotationsVisible
                  ? 'bg-purple-800/70 text-purple-100'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
                : 'bg-neutral-800 text-neutral-600 cursor-default'
            }`}
            title="测量标注 显示/隐藏"
          >
            标注{annotations.length > 0 ? ` ${annotations.length}` : ''}
          </button>
          <button
            className={`px-2 py-1 rounded transition-colors cursor-pointer font-mono ${
              snapGrid > 0 ? 'bg-blue-800 text-blue-200' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
            onClick={() => setSnapGrid((g) => (g === 0 ? 10 : g === 10 ? 50 : 0))}
            title="对齐网格 (G 键)"
          >
            Grid {gridLabel}
          </button>
          <span className="text-neutral-500 w-9 text-right font-mono">{zoomPct}%</span>
          <button
            className="px-2 py-1 text-neutral-400 bg-neutral-800 rounded hover:bg-neutral-700 transition-colors cursor-pointer"
            onClick={resetView}
            title="适配视图"
          >
            适配
          </button>
        </div>
      </div>

      {/* ---- SVG ---- */}
      <div className="flex-1 overflow-hidden relative" style={{ cursor }}>
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="w-full h-full block"
          style={{ background: '#14141e', touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
        >
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
          {snapGrid > 0 && <rect x={-svgW / 2} y={-svgH / 2} width={svgW} height={svgH} fill="url(#snapDots)" />}

          {/* Tabletop */}
          <rect
            x={-halfW} y={-halfD} width={width} height={depth} rx="2"
            fill={COLORS.tabletop} fillOpacity="0.3" stroke={COLORS.tabletopStroke} strokeWidth="2"
          />
          <line x1={-halfW - 20} y1={0} x2={halfW + 20} y2={0} stroke={COLORS.tabletopStroke} strokeWidth="0.5" strokeDasharray="8 4" />
          <line x1={0} y1={-halfD - 20} x2={0} y2={halfD + 20} stroke={COLORS.tabletopStroke} strokeWidth="0.5" strokeDasharray="8 4" />

          {/* Beam projections */}
          {beamLines.map((l) => {
            const dx = l.x2 - l.x1;
            const dy = l.y2 - l.y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1) return null;
            const ux = dx / len; const uy = dy / len;
            const nx = -uy; const ny = ux;
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
                <path d={d} fill={COLORS.profileFill} fillOpacity="0.35" stroke={COLORS.profileStroke} strokeWidth="0.8" strokeOpacity="0.5" />
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={COLORS.profileStroke} strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4" />
                <rect x={(l.x1 + l.x2) / 2 - 14} y={(l.y1 + l.y2) / 2 - 6} width="28" height="12" rx="3" fill="#1a1a2e" fillOpacity="0.85" />
                <text x={(l.x1 + l.x2) / 2} y={(l.y1 + l.y2) / 2 + 4} textAnchor="middle" fontSize="6" fill={COLORS.profileStroke}>
                  {l.name}
                </text>
              </g>
            );
          })}

          {/* Measure annotations */}
          {annotationsVisible && annotations.map((a) => {
            const sel = a.id === annoSelectedId;
            const d = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
            const mx = (a.x1 + a.x2) / 2;
            const myDisp = toSvgY((a.y1 + a.y2) / 2);
            return (
              <g key={a.id} data-anno="" data-anno-id={a.id}>
                <line
                  x1={a.x1} y1={toSvgY(a.y1)} x2={a.x2} y2={toSvgY(a.y2)}
                  stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke', cursor: activeTool === 'select' ? 'pointer' : 'inherit' }}
                />
                <line
                  x1={a.x1} y1={toSvgY(a.y1)} x2={a.x2} y2={toSvgY(a.y2)}
                  stroke={sel ? COLORS.annoSelected : COLORS.measure}
                  strokeWidth={sel ? 1.6 : 1} strokeDasharray="5 3" style={{ pointerEvents: 'none' }}
                />
                <rect x={mx - 16} y={myDisp - 12} width="32" height="14" rx="3"
                  fill={sel ? '#3a2f06' : '#1a1a2e'} fillOpacity="0.92" stroke={sel ? COLORS.annoSelected : COLORS.measure}
                  strokeWidth="0.5" style={{ pointerEvents: 'none' }}
                />
                <text x={mx} y={myDisp - 1} textAnchor="middle" fontSize="7" fill={sel ? COLORS.annoSelected : COLORS.measure}
                  fontFamily="monospace" style={{ pointerEvents: 'none' }}>
                  {d.toFixed(1)}mm
                </text>
              </g>
            );
          })}

          {/* Measure draft (visible even if committed annotations are hidden) */}
          {measureStart && measureCur && (
            <g style={{ pointerEvents: 'none' }}>
              {(() => {
                const dx = measureCur.x - measureStart.x;
                const dy = measureCur.y - measureStart.y;
                const d = Math.hypot(dx, dy);
                // Live total + horizontal/vertical components while axis-locked.
                const parts: string[] = [`${d.toFixed(0)}mm`];
                const absDX = Math.abs(dx);
                const absDY = Math.abs(dy);
                if (absDY < 0.5) parts.push(`→ ${absDX.toFixed(0)}`);
                else if (absDX < 0.5) parts.push(`↑ ${absDY.toFixed(0)}`);
                const mx = (measureStart.x + measureCur.x) / 2;
                const my = (measureStart.y + measureCur.y) / 2;
                const label = parts.join('  ');
                const above = absDX >= absDY ? -6 : 9;
                return (
                  <>
                    <line
                      x1={measureStart.x} y1={toSvgY(measureStart.y)}
                      x2={measureCur.x} y2={toSvgY(measureCur.y)}
                      stroke={COLORS.measure} strokeWidth="0.8" strokeDasharray="4 3" opacity="0.8"
                    />
                    <circle cx={measureStart.x} cy={toSvgY(measureStart.y)} r="2.5" fill={COLORS.measure} />
                    {d > 0.5 && (
                      <>
                        <rect x={mx - 34} y={toSvgY(my) + above - 7} width="68" height="12" rx="2"
                          fill="#1a1a2e" fillOpacity="0.92" stroke={COLORS.measure} strokeWidth="0.4"
                        />
                        <text x={mx} y={toSvgY(my) + above + 2} textAnchor="middle" fontSize="7"
                          fill={COLORS.measure} fontFamily="monospace">
                          {label}
                        </text>
                      </>
                    )}
                  </>
                );
              })()}
            </g>
          )}

          {/* Alignment guides */}
          {selectedHole &&
            alignmentGuides.xLines.map((ox, i) => (
              <line key={`gx-${i}`} x1={selectedHole.x} y1={toSvgY(selectedHole.y)} x2={ox} y2={toSvgY(selectedHole.y)}
                stroke={COLORS.alignGuide} strokeWidth="0.5" strokeDasharray="4 3" opacity="0.6" style={{ pointerEvents: 'none' }} />
            ))}
          {selectedHole &&
            alignmentGuides.yLines.map((oy, i) => (
              <line key={`gy-${i}`} x1={selectedHole.x} y1={toSvgY(selectedHole.y)} x2={selectedHole.x} y2={toSvgY(oy)}
                stroke={COLORS.alignGuide} strokeWidth="0.5" strokeDasharray="4 3" opacity="0.6" style={{ pointerEvents: 'none' }} />
            ))}

          {/* Ghost preview while adding */}
          {isAddTool && ghost && (
            <path
              d={holeSvgPathD(ghostHole(activeTool === 'addCircle' ? 'circle' : activeTool === 'addRect' ? 'rect' : 'slot', ghost.x, ghost.y), toSvgY)}
              fill={COLORS.hole} fillOpacity="0.12" stroke={COLORS.ghost} strokeWidth="1" strokeDasharray="4 3"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* User holes */}
          {holes.map((hole) => {
            const isSel = hole.id === selectedHoleId;
            const d = holeSvgPathD(hole, toSvgY);
            return (
              <g key={hole.id} data-hole={hole.id}>
                {/* Hit overlay: whole (rotated) silhouette is clickable/draggable */}
                <path
                  d={d}
                  fill="transparent" stroke="transparent" strokeWidth={16}
                  style={{ pointerEvents: 'all', cursor: activeTool === 'select' ? (hole.id === draggingHoleId ? 'grabbing' : 'grab') : 'inherit' }}
                />
                <path
                  d={d}
                  fill={isSel ? COLORS.holeSelected : COLORS.hole}
                  fillOpacity={isSel ? 0.55 : 0.4}
                  stroke={isSel ? COLORS.holeSelected : COLORS.hole}
                  strokeWidth={isSel ? 1.8 : 1}
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            );
          })}

          {/* Measure attach preview: the points the hovered shape can snap to.
              (centre + four axis extremes). The real magnet marker is drawn on
              top and emphasises whichever one is currently within reach. */}
          {activeTool === 'measure' && hoverAnchors && (
            <g style={{ pointerEvents: 'none' }}>
              {hoverAnchors.pts.map((p, i) => (
                <circle
                  key={i}
                  data-attach=""
                  cx={p.x} cy={toSvgY(p.y)}
                  r="2.4" fill="none" stroke={COLORS.snapMarker} strokeWidth="0.8" opacity="0.55"
                />
              ))}
            </g>
          )}

          {/* Snap marker (colour/shape tells what it attached to) */}
          {magnet && !rotatingHoleId && !draggingHoleId && (() => {
            const kind = magnet.kind ?? 'point';
            const col = kind === 'edge' ? COLORS.snapEdge : kind === 'axis' ? COLORS.snapAxis : COLORS.snapMarker;
            const x = magnet.x;
            const y = toSvgY(magnet.y);
            return (
              <g style={{ pointerEvents: 'none' }}>
                <circle cx={x} cy={y} r={kind === 'axis' ? 4.4 : 3.2} fill="none" stroke={col} strokeWidth="1.2" />
                {kind === 'axis' && (
                  <circle cx={x} cy={y} r="6.6" fill="none" stroke={col} strokeWidth="0.6" opacity="0.6" />
                )}
                <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={col} strokeWidth="0.6" />
                <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke={col} strokeWidth="0.6" />
                {kind === 'edge' && <circle cx={x} cy={y} r="1.1" fill={col} />}
              </g>
            );
          })()}

          {/* Selection decorations */}
          {selectedHole && selBox && (
            <g>
              <rect
                x={selBox.minX} y={toSvgY(selBox.maxY)}
                width={selBox.maxX - selBox.minX} height={selBox.maxY - selBox.minY}
                fill="none" stroke={COLORS.holeSelected} strokeWidth="0.6" strokeDasharray="3 2"
                style={{ pointerEvents: 'none' }}
              />
              {/* Rotation handle (rect/slot only) */}
              {rotHandlePt && (
                <g>
                  <line
                    x1={selectedHole.x} y1={toSvgY(selectedHole.y)}
                    x2={rotHandlePt.x} y2={toSvgY(rotHandlePt.y)}
                    stroke={COLORS.holeSelected} strokeWidth="0.6" opacity="0.7"
                    style={{ pointerEvents: 'none' }}
                  />
                  <circle
                    cx={rotHandlePt.x} cy={toSvgY(rotHandlePt.y)} r="5"
                    fill="#1a1a2e" stroke={COLORS.holeSelected} strokeWidth="1.2"
                    style={{ pointerEvents: 'none' }}
                  />
                  <circle
                    cx={rotHandlePt.x} cy={toSvgY(rotHandlePt.y)} r="11"
                    fill="transparent" stroke="transparent"
                    data-rot-handle="" data-hole-id={selectedHole.id}
                    style={{ pointerEvents: 'all', cursor: 'grab' }}
                  />
                </g>
              )}
              {edgeDist && <EdgeDistLabels bbox={selBox} dist={edgeDist} toSvgY={toSvgY} />}
            </g>
          )}

          {/* Board dimension lines */}
          <BoardDims width={width} depth={depth} halfW={halfW} halfD={halfD} />
        </svg>

        {/* Tool hint */}
        {(isAddTool || activeTool === 'measure') && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <div className="px-3 py-1.5 rounded-full bg-neutral-800/90 border border-neutral-700 text-[11px] text-neutral-300 shadow-lg whitespace-nowrap">
              {activeTool === 'measure'
                ? measureStart
                  ? '单击第二点记录距离（吸附孔特征点/板边/水平垂直）· Esc 退出'
                  : '单击第一点（吸附孔心/孔特征点/板边）'
                : '在台面上单击放置（吸附网格/孔心）· Esc 退出'}
            </div>
          </div>
        )}
      </div>

      {/* ---- Footer ---- */}
      <div className="px-4 py-2 border-t border-neutral-800 flex-shrink-0 flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3 text-[10px] text-neutral-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-wood-400/30 border border-wood-600" /> 台面</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#6b7b8d]/40 border border-[#8899aa]" /> 型材投影</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400/50 border border-red-400" /> 开孔</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full border border-[#c4b5fd]" /> 测量标注</span>
          {snapGrid > 0 && (
            <span className="flex items-center gap-1 text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Grid {snapGrid}mm</span>
          )}
        </div>
        <div className="text-[10px] text-neutral-600 text-right leading-relaxed">
          方向键 移动(Shift 10mm) · +/- 主尺寸 · R 旋转15° · G 网格 · Del 删除 · Esc 返回 · Ctrl+Z 撤销
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Edge distance labels (bbox-anchored, per plan-mode thresholds)
// ============================================================

const EdgeDistLabels: React.FC<{
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  dist: { left: number; right: number; top: number; bottom: number };
  toSvgY: (y: number) => number;
}> = ({ bbox: b, dist: d, toSvgY }) => {
  const cy = toSvgY((b.minY + b.maxY) / 2);
  const cx = (b.minX + b.maxX) / 2;
  const items = [
    { v: d.left, x: b.minX - 18, y: cy, dx: b.minX, dy: cy },
    { v: d.right, x: b.maxX + 18, y: cy, dx: b.maxX, dy: cy },
    { v: d.top, x: cx, y: toSvgY(b.maxY) - 18, dx: cx, dy: toSvgY(b.maxY) },
    { v: d.bottom, x: cx, y: toSvgY(b.minY) + 18, dx: cx, dy: toSvgY(b.minY) },
  ];
  return (
    <>
      {items.map((it, i) => {
        const c = it.v < EDGE_WARN_THRESHOLD ? COLORS.edgeDanger
          : it.v < EDGE_WARN_THRESHOLD * 2 ? COLORS.edgeWarn : COLORS.edgeSafe;
        return (
          <g key={i}>
            <line x1={it.dx} y1={it.dy} x2={it.x} y2={it.y} stroke={c} strokeWidth="0.5" strokeDasharray="2 2" />
            <rect x={it.x - 13} y={it.y - 7} width="26" height="14" rx="3" fill="#1a1a2e" fillOpacity="0.9" stroke={c} strokeWidth="0.5" />
            <text x={it.x} y={it.y + 4} textAnchor="middle" fontSize="7" fill={c} fontFamily="monospace">
              {Math.round(it.v)}
            </text>
          </g>
        );
      })}
    </>
  );
};

// ============================================================
// Dimension lines (outer board width/depth)
// ============================================================

const DimLine: React.FC<{
  x1: number; y1: number; x2: number; y2: number;
  label: string; color: string;
}> = ({ x1, y1, x2, y2, label, color }) => {
  const isV = Math.abs(y1 - y2) > Math.abs(x1 - x2);
  const t = 8;
  const o = 14;
  if (isV) {
    const tx = x1 - 18;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.8" />
        <line x1={x1 - t} y1={y1} x2={x1 + t} y2={y1} stroke={color} strokeWidth="0.8" />
        <line x1={x2 - t} y1={y2} x2={x2 + t} y2={y2} stroke={color} strokeWidth="0.8" />
        <line x1={x1} y1={y1} x2={x1 + o} y2={y1} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
        <line x1={x1} y1={y2} x2={x1 + o} y2={y2} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
        <text x={tx} y={(y1 + y2) / 2} textAnchor="middle" fontSize="7" fill={color} transform={`rotate(-90, ${tx}, ${(y1 + y2) / 2})`}>
          {label}
        </text>
      </g>
    );
  }
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.8" />
      <line x1={x1} y1={y1 - t} x2={x1} y2={y1 + t} stroke={color} strokeWidth="0.8" />
      <line x1={x2} y1={y2 - t} x2={x2} y2={y2 + t} stroke={color} strokeWidth="0.8" />
      <line x1={x1} y1={y1} x2={x1} y2={y1 - o} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
      <line x1={x2} y1={y2} x2={x2} y2={y2 - o} stroke={color} strokeWidth="0.5" strokeDasharray="3 2" />
      <text x={(x1 + x2) / 2} y={y1 - o + 14} textAnchor="middle" fontSize="7" fill={color}>{label}</text>
    </g>
  );
};

const BoardDims: React.FC<{ width: number; depth: number; halfW: number; halfD: number }> =
  ({ width, depth, halfW, halfD }) => (
    <g style={{ pointerEvents: 'none' }}>
      {/* Board rect spans [-halfW,-halfD]..[+halfW,+halfD]; offsets sit in the 100mm padding. */}
      <DimLine x1={-halfW} y1={halfD + 34} x2={halfW} y2={halfD + 34} label={`${width} mm`} color={COLORS.dimension} />
      <DimLine x1={-halfW - 34} y1={-halfD} x2={-halfW - 34} y2={halfD} label={`${depth} mm`} color={COLORS.dimension} />
    </g>
  );

export default TabletopPlan;
