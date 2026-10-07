// ---------------------------------------------------------------------------
// A photograph becomes a board.
//
// Pure conversion — `File` in, `BoardRecord` out — with no React and no store,
// the same split `utils/dxfImport.ts` uses for the other "the user brought their
// own asset" flow: the util does the work, the component tells the store, the
// store owns the state.
//
// Three things happen here, and only the first is obvious:
//
// 1. CROP TO A SQUARE AND RESIZE. Every board in this app is described as "one
//    square tile covering N millimetres" (`faceTileMm`), and the whole UV path is
//    written against that: `applyBoardUVs` divides both axes by the same number.
//    A photo is 3:2 or 4:3. Rather than teach the descriptor about rectangles,
//    the largest centred square is taken and resampled to 1024², which is the
//    size of the baked tiles — one size for every board keeps mip cost and
//    filtering behaviour identical across the picker.
//
// 2. DERIVE A ROUGHNESS MAP. The baked boards each ship a hand-authored
//    `_rough.png`; an upload has none, and without one the board renders as a
//    uniformly glossy slab that looks wrong beside the other four. Luminance is
//    the honest proxy available — dark latewood is denser, and denser wood
//    finishes slightly differently — so it is read at 256² and mapped into a
//    NARROW band. The low resolution is deliberate: it is also the low-pass,
//    and a full-resolution luminance map reads as sandpaper rather than as grain.
//
// 3. MEASURE A SWATCH COLOUR, for the picker chip. The baked entries carry a
//    hand-picked tint; a mean of the crop is the same thing, measured.
//
// What this deliberately does NOT do is undo the photograph: no perspective
// correction, no highlight removal, no vignette flattening. What the user
// supplies is a square material sample, not a rectified scan of a board.
// ---------------------------------------------------------------------------

import { FACE_TILE_MM } from './tabletopTextures';
import { makeBoardId, type BoardRecord } from './boardRegistry';
import { t } from '../i18n';

/** Matches the baked PNGs (`scripts/bake_tabletop_textures.py`). */
const FACE_PX = 1024;
/** Roughness is a low-frequency field by nature; see the note above. */
const ROUGH_PX = 256;
/** Refuse before decoding, not after: a 60 MP photo is a decode stall and a
 *  guaranteed quota failure, and the user deserves to hear it immediately. */
const MAX_BYTES = 20 * 1024 * 1024;
/** Roughness band, matched to the BAKED boards rather than to what looks
 *  plausible in isolation.
 *
 *  The bake derives its roughness as `sp.rough * (1 - 0.20 * (1 - tone))` plus
 *  0.03 of noise, with `sp.rough` between 0.50 (walnut) and 0.60 (oak) — so every
 *  baked board lives in [0.37, 0.63], around 0.50. A wider band here (0.45-0.85,
 *  say) renders every upload duller than every built-in board: it looks fine on
 *  its own and wrong the moment it sits next to the oak. */
const ROUGH_MIN = 0.45;
const ROUGH_SPAN = 0.16;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas could not be encoded'))),
      type,
      quality,
    );
  });
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas is unavailable in this browser');
  return c;
}

/** A crop's mean colour as `#rrggbb`, for the picker chip's fallback tint. */
function meanColor(px: Uint8ClampedArray): string {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) {
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
  }
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Decode, crop, and derive everything a board needs.
 *
 * `tileMm` is the one thing the image cannot tell us: how many millimetres of
 * real board the square covers. It defaults to the baked boards' 600 mm, which
 * is the right guess for a photo taken at a normal working distance, and the
 * picker lets the user correct it — the answer changes the grain's size on the
 * desk, and nothing else about the board.
 *
 * Throws (with a sentence meant for the user) on a file that cannot be used.
 */
export async function boardFromFile(file: File, tileMm: number = FACE_TILE_MM): Promise<BoardRecord> {
  if (file.size > MAX_BYTES) {
    throw new Error(t('panel.errTooLarge', { mb: Math.round(file.size / 1024 / 1024) }));
  }
  const mm = Math.round(tileMm);
  if (!Number.isFinite(mm) || mm <= 0) throw new Error(t('panel.errTileMm'));

  let bitmap: ImageBitmap;
  try {
    // `from-image` honours the EXIF orientation, without which a phone photo
    // held sideways arrives rotated 90° with no way to tell that it should not
    // be. Older browsers ignore the member rather than failing.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(t('panel.errNotImage'));
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    if (side < 32) throw new Error(t('panel.errTooSmall'));
    const sx = Math.round((bitmap.width - side) / 2);
    const sy = Math.round((bitmap.height - side) / 2);

    const face = document.createElement('canvas');
    face.width = FACE_PX;
    face.height = FACE_PX;
    const fc = ctx2d(face);
    fc.imageSmoothingEnabled = true;
    fc.imageSmoothingQuality = 'high';
    fc.drawImage(bitmap, sx, sy, side, side, 0, 0, FACE_PX, FACE_PX);

    // One canvas for both jobs: sample it, then overwrite it with the derived
    // values and encode that. Sampled after the downscale, so the map is the
    // average of each 4×4 block rather than one pixel out of it — a per-pixel
    // read of a noisy photo gives a roughness map made of noise.
    const rough = document.createElement('canvas');
    rough.width = ROUGH_PX;
    rough.height = ROUGH_PX;
    const rc = ctx2d(rough);
    rc.drawImage(bitmap, sx, sy, side, side, 0, 0, ROUGH_PX, ROUGH_PX);
    const sampled = rc.getImageData(0, 0, ROUGH_PX, ROUGH_PX);
    const color = meanColor(sampled.data);

    const data = sampled.data;
    for (let i = 0; i < data.length; i += 4) {
      // Rec. 709 luma: green carries most of the perceived brightness, and a
      // flat channel average would make red-toned walnut read darker than it is.
      const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      const v = Math.round((ROUGH_MIN + ROUGH_SPAN * (1 - lum)) * 255);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    rc.putImageData(sampled, 0, 0);

    // WebP where it is offered: a photograph re-encoded as PNG is 5–10× the
    // bytes for no visible gain here, and these bytes are decoded on every load.
    // `toBlob` falls back to PNG on its own if the type is not supported, and
    // either way the result is a blob the texture loader can read.
    const [faceBlob, roughBlob] = await Promise.all([
      toBlob(face, 'image/webp', 0.92),
      toBlob(rough, 'image/webp', 0.9),
    ]);

    return {
      id: makeBoardId(),
      // The file name is what the user recognises in the list. The extension is
      // noise; the stamp that keeps ids unique is not something to look at.
      // The file name is the user's own word and stays as typed; the fallback is
      // ours, so it is the only branch that goes through the dictionary.
      label: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || t('name.uploadedBoard'),
      color,
      tileMm: mm,
      faceBlob,
      roughBlob,
    };
  } finally {
    bitmap.close();
  }
}
