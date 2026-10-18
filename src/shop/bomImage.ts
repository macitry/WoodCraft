/**
 * The take-away picture: the model render with the parts list under it.
 *
 * The viewer's canvas is only half a document — a customer who forwards the
 * picture to a fabricator also forwards the list, and two files that can drift
 * apart are worse than one. So the picture is composed here: the render, the
 * desk's size and materials, the same rows the table and the CSV carry, and the
 * total mass.
 *
 * Everything is drawn on a 2D canvas at the RENDER'S OWN PIXEL SIZE, so the
 * sheet is as sharp as the screen it came from. Text is drawn rather than
 * screenshotted from the DOM because there is no DOM-to-image here, and adding
 * one would be a dependency for a page that already has the rows in hand.
 *
 * No prices, for the reason the list gives: the server does not quote yet.
 */

export interface BomSheetInput {
  /** The WebGL canvas from the viewer. Read via `drawImage`, not `toDataURL`. */
  canvas: HTMLCanvasElement;
  title: string;
  subtitle: string;
  sectionTitle: string;
  columns: string[];
  /** One array per row, same length as `columns`. Already translated. */
  rows: string[][];
  footer: string;
}

const BG = '#14141d';
const INK = '#ececef';
const MUTED = '#a6a6b4';
const RULE = 'rgba(255, 255, 255, 0.13)';
const STRIPE = 'rgba(255, 255, 255, 0.035)';
const FONT = 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';

// Percentages of the table's width. Name and type need the most; the last four
// are numbers and are right-aligned.
const COLUMN_WEIGHTS = [0.3, 0.16, 0.14, 0.1, 0.11, 0.08, 0.11];
const RIGHT_ALIGN_FROM = 4;

/** The sheet's width in design pixels. The pane is about 648 CSS px wide, and
 *  seven columns do not fit in that: `Section`, `Aluminium` and `15.304 kg`
 *  all arrived ellipsized. 900 gives the table room without shrinking the
 *  type, and the model simply keeps its own pixel size inside a wider sheet. */
const DESIGN_W = 900;

export function bomSheetBlob(input: BomSheetInput): Promise<Blob | null> {
  const { canvas } = input;
  if (!canvas.width || !canvas.height) return Promise.resolve(null);

  // Work in CSS px so the sheet is the same shape at any device-pixel ratio,
  // then multiply by the ratio so text is drawn at the screen's own density.
  const cssW = canvas.getBoundingClientRect().width || 648;
  // `max(1, …)`: a rect measured a fraction narrow must not shrink the sheet.
  const density = Math.max(1, canvas.width / cssW);
  const W = Math.max(canvas.width, Math.round(DESIGN_W * density));
  const u = W / DESIGN_W;

  // The pane is portrait and the desk sits in the middle of it. Cropping to
  // what was actually drawn keeps the sheet from being mostly air.
  const crop = renderedBounds(canvas) ?? { x: 0, y: 0, w: canvas.width, h: canvas.height };

  const pad = 30 * u;
  const titleSize = 25 * u;
  const subSize = 14.5 * u;
  const sectionSize = 19 * u;
  const cellSize = 13.5 * u;
  const rowH = 30 * u;
  const bannerH = 430 * u;
  const availW = W - 2 * pad;

  const modelScale = Math.min(availW / crop.w, bannerH / crop.h);
  const modelW = crop.w * modelScale;
  const modelH = crop.h * modelScale;

  // Height is known before drawing, so the canvas can be sized once rather
  // than resized mid-draw (which clears it).
  let y = pad;
  y += titleSize * 1.15;
  y += subSize * 1.1 + 22 * u;
  const bannerTop = y;
  y += bannerH + 26 * u;
  y += sectionSize * 1.2 + 8 * u;
  const tableTop = y;
  const tableH = rowH * (1 + input.rows.length);
  const footerTop = tableTop + tableH + 14 * u;
  const H = Math.round(footerTop + rowH + pad);

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  if (!ctx) return Promise.resolve(null);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // --- title block --------------------------------------------------------
  let ty = pad + titleSize * 0.82;
  ctx.font = `600 ${titleSize}px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText(input.title, pad, ty);

  ty = pad + titleSize * 1.15 + subSize * 0.9;
  ctx.font = `${subSize}px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(input.subtitle, pad, ty);

  // --- the model ----------------------------------------------------------
  // The render's background is the same colour as the sheet's, so no frame or
  // rounded corners are needed around it — only centring.
  ctx.drawImage(
    canvas,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    pad + (availW - modelW) / 2,
    bannerTop + (bannerH - modelH) / 2,
    modelW,
    modelH,
  );

  // --- the list -----------------------------------------------------------
  const sectionY = bannerTop + bannerH + 26 * u;
  ctx.font = `600 ${sectionSize}px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText(input.sectionTitle, pad, sectionY + sectionSize * 0.85);

  const colX: number[] = [];
  const colW: number[] = [];
  let acc = pad;
  for (const weight of COLUMN_WEIGHTS) {
    colX.push(acc);
    colW.push(availW * weight);
    acc += availW * weight;
  }

  const cellText = (text: string, i: number, rowY: number, colour: string, weight = '') => {
    const right = i >= RIGHT_ALIGN_FROM;
    const x = right ? colX[i] + colW[i] - 8 * u : colX[i];
    ctx.textAlign = right ? 'right' : 'left';
    ctx.fillStyle = colour;
    ctx.font = `${weight ? `${weight} ` : ''}${cellSize}px ${FONT}`;
    ctx.fillText(ellipsize(ctx, text, colW[i] - 16 * u), x, rowY + rowH * 0.65);
  };

  // Header row, then a rule between it and the body.
  ctx.fillStyle = RULE;
  ctx.fillRect(pad, tableTop, availW, Math.max(1, u));
  input.columns.forEach((label, i) => {
    cellText(label, i, tableTop, MUTED, '600');
  });
  ctx.fillStyle = RULE;
  ctx.fillRect(pad, tableTop + rowH, availW, Math.max(1, u));

  input.rows.forEach((cells, r) => {
    const rowTop = tableTop + rowH * (1 + r);
    if (r % 2 === 1) {
      ctx.fillStyle = STRIPE;
      ctx.fillRect(pad, rowTop, availW, rowH);
    }
    cells.forEach((cell, i) => cellText(cell, i, rowTop, INK));
  });

  // --- footer -------------------------------------------------------------
  ctx.fillStyle = RULE;
  ctx.fillRect(pad, footerTop, availW, Math.max(1, u));
  ctx.textAlign = 'left';
  ctx.font = `${subSize}px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(input.footer, pad, footerTop + rowH * 0.7);

  return new Promise((resolve) => {
    try {
      out.toBlob(resolve, 'image/png');
    } catch {
      // A tainted canvas (it is not, today) throws rather than resolving null.
      resolve(null);
    }
  });
}

/**
 * The box the model actually occupies in the render.
 *
 * The pane's background is a flat `#14141d` (see `ShopViewer`), so anything a
 * few steps away from that is furniture or its shading. Sampled every other
 * pixel: at dpr 2 the canvas is around 1300 wide, and the outline does not go
 * anywhere in a single pixel.
 */
function renderedBounds(canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const probe = document.createElement('canvas');
  probe.width = canvas.width;
  probe.height = canvas.height;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  if (!pctx) return null;
  pctx.drawImage(canvas, 0, 0);

  let data: ImageData;
  try {
    data = pctx.getImageData(0, 0, probe.width, probe.height);
  } catch {
    return null; // tainted; fall back to the whole canvas
  }

  const { width, height } = data;
  const d = data.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (
        Math.abs(d[i] - 20) > 12 ||
        Math.abs(d[i + 1] - 20) > 12 ||
        Math.abs(d[i + 2] - 29) > 14
      ) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;

  // A step of two can miss the outermost column; grow by one and add air.
  const x0 = Math.max(0, minX - 6);
  const y0 = Math.max(0, minY - 6);
  const x1 = Math.min(width - 1, maxX + 6);
  const y1 = Math.min(height - 1, maxY + 6);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Shorten with an ellipsis to fit `maxW`, measured in the context's font. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}
