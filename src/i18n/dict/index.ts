// ---------------------------------------------------------------------------
// The dictionary, assembled from one file per area of the UI.
//
// Adding an area is two lines here and one new file: import its `zh` and `en`
// and spread them into the two objects below. Each area owns a key prefix
// (`diy.`, `kit.`, `bom.` …), which is what keeps two files from quietly
// defining the same key — a spread cannot detect a collision, a prefix cannot
// have one.
//
// The `en` annotation is the actual guard: it is typed against the key set of
// the merged `zh`, so a key translated in one file and forgotten in another is
// a `tsc -b` error rather than a string that falls back to its own key name.
// ---------------------------------------------------------------------------

import { zh as commonZh, en as commonEn } from './common';
import { zh as homeZh, en as homeEn } from './home';
import { zh as dataZh, en as dataEn } from './data';
import { zh as catalogZh, en as catalogEn } from './catalog';
import { zh as diyZh, en as diyEn } from './diy';
import { zh as kitZh, en as kitEn } from './kit';
import { zh as planZh, en as planEn } from './plan';
import { zh as panelZh, en as panelEn } from './panel';

export const zh = {
  ...commonZh,
  ...homeZh,
  ...dataZh,
  ...catalogZh,
  ...diyZh,
  ...kitZh,
  ...planZh,
  ...panelZh,
};

export type DictKey = keyof typeof zh;

export const en: Record<DictKey, string> = {
  ...commonEn,
  ...homeEn,
  ...dataEn,
  ...catalogEn,
  ...diyEn,
  ...kitEn,
  ...planEn,
  ...panelEn,
};
