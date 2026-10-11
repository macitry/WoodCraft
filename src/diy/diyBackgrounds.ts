import type { DiyKey } from '../i18n/dict/diy';

/**
 * The backdrops the free-form builder can be drawn on.
 *
 * Flat colours and gradients, not pictures. What a background is FOR here is
 * contrast — somewhere dark to judge a bright extrusion against, somewhere
 * light to read a dark shadow on — and a photograph would put something behind
 * the parts for the eye to fight with.
 *
 * Each one carries its own grid colours. A single pair cannot serve both ends
 * of the range: `#303050` on the navy is the intended whisper and on the studio
 * white it is a drawn-on bar, while a grid pale enough for the white is gone
 * entirely on the graphite. Two hand-picked strings per background is less
 * clever than deriving them from luminance and more reliably right, because
 * "right" here is a judgement about how loud the grid should be on that ground,
 * not a formula — and it is a judgement that can be made once, in a table.
 */
export type DiyBackgroundId = 'navy' | 'graphite' | 'slate' | 'ember' | 'mist' | 'studio';

export interface DiyBackgroundDef {
  id: DiyBackgroundId;
  /** Typed as a `diy` key rather than a free string so a background cannot name
   *  a label that does not exist, and `en` is checked against `zh`. */
  labelKey: DiyKey;
  /**
   * The stage's CSS `background` — and the exact string the picker's chip is
   * filled with, so a chip can never show a colour other than the one it
   * applies.
   *
   * CSS rather than a three colour because three of the six are gradients, and
   * a gradient is one thing the browser already knows how to paint. The scene
   * canvas is transparent (`DiyViewer`), so this is literally what is behind
   * the parts rather than a colour painted over them.
   */
  css: string;
  /** Grid line colours, in `gridHelper`'s order: the two centre lines first,
   *  then every other line. */
  grid: [string, string];
}

/** In picker order. Dark first, falling towards the lights: the order is also
 *  a gradient, so scrolling the list reads as turning the lights up. */
export const DIY_BACKGROUNDS: DiyBackgroundDef[] = [
  { id: 'navy', labelKey: 'diy.bgNavy', css: '#1a1a2e', grid: ['#303050', '#202035'] },
  { id: 'graphite', labelKey: 'diy.bgGraphite', css: '#14161a', grid: ['#343a42', '#22262c'] },
  {
    id: 'slate',
    labelKey: 'diy.bgSlate',
    css: 'linear-gradient(180deg, #2b3446 0%, #0f1319 100%)',
    grid: ['#4a5b78', '#2b3546'],
  },
  {
    id: 'ember',
    labelKey: 'diy.bgEmber',
    css: 'linear-gradient(180deg, #3a2e24 0%, #16120e 100%)',
    grid: ['#5c4632', '#332619'],
  },
  {
    id: 'mist',
    labelKey: 'diy.bgMist',
    css: 'linear-gradient(180deg, #f2f4f7 0%, #c7ccd4 100%)',
    grid: ['#9aa3af', '#c2c8d0'],
  },
  { id: 'studio', labelKey: 'diy.bgStudio', css: '#e9e6e0', grid: ['#b9b4aa', '#d3cfc7'] },
];

/** The backdrop the builder has always had, and the one it opens on. Keeping
 *  the default as the old hard-coded `#1a1a2e` is what makes this feature
 *  invisible until it is used. */
export const DEFAULT_BACKGROUND: DiyBackgroundId = 'navy';

const BY_ID = new Map(DIY_BACKGROUNDS.map((b) => [b.id, b]));

/** The definition for an id, falling back to the default rather than throwing:
 *  an id left over from a background this build no longer has should cost the
 *  user that choice, not the page. */
export function backgroundById(id: DiyBackgroundId): DiyBackgroundDef {
  return BY_ID.get(id) ?? (BY_ID.get(DEFAULT_BACKGROUND) as DiyBackgroundDef);
}

// ------------------------------------------------------------------ remembering

/**
 * The choice survives a reload, in bare localStorage — the treatment `diy.leftW`
 * (the sidebar width), the interface language and the selected board all
 * already get. Which ground you want to look at your own model on is a
 * preference about your eyes, and re-picking it every reload is the annoyance
 * persistence exists to remove.
 *
 * Both directions swallow failure. A blocked localStorage — private mode, no
 * cookies — costs the user the remembered background, never the page.
 */
const STORAGE_KEY = 'diy.background';

export function readBackground(): DiyBackgroundId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Checked against the list rather than cast. The stored string outlives the
    // code that wrote it, and a name from a background since removed is exactly
    // the case this is here for.
    return DIY_BACKGROUNDS.some((b) => b.id === raw) ? (raw as DiyBackgroundId) : DEFAULT_BACKGROUND;
  } catch {
    return DEFAULT_BACKGROUND;
  }
}

export function writeBackground(id: DiyBackgroundId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Nothing to do and nothing to say: the background still changed on screen.
  }
}
