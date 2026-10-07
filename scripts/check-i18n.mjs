// ---------------------------------------------------------------------------
// Repo guard: no Chinese text may survive in a rendering file.
//
// The app is bilingual by dictionary, so a Chinese literal in a component is a
// string that can only ever be Chinese — exactly the 中英混杂 this guard keeps
// out. The rule is structural rather than an allowlist of blessed files: a
// `.tsx` file is by definition a file that renders, so if a `.tsx` holds CJK
// outside a comment, something on screen is un-switchable.
//
// `.ts` files are NOT scanned, and that is the point. The tabless modules —
// `store/modelStore.ts`, `mock/exampleModel.ts`, `utils/accessoryKits.ts`,
// `materials/tabletopTextures.ts`, `diy/connectors.ts`, `utils/holeTemplates.ts`
// — hold the Chinese that the dictionary keys fall back TO. Those literals are
// the source the `tpl.*` / `part.*` / `cat.*` / `tex.*` / `fam.*` keys were read
// off; a guard that flagged them would be asking for the dictionary to be
// deleted. What matters is that nothing RENDERS them directly, which is what
// scanning `.tsx` tests.
//
// Comments are exempt everywhere: they are prose for whoever reads the source,
// and the source is not the interface.
//
//   node scripts/check-i18n.mjs          # from the repo root
//
// Exit 0 = clean. Exit 1 = at least one line to look at, printed with file:line.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'src');
const EXEMPT = /^src[/\\]i18n[/\\]/;
// CJK unified ideographs + the CJK punctuation/fullwidth forms that travel with
// them. Kept as explicit ranges rather than \p{Script=Han} so the guard runs on
// the same Node the project does without a unicode-property flags caveat.
const CJK = /[　-〿一-鿿＀-￯]/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Blank out comments, preserving newlines so reported line numbers stay true. */
function stripComments(src) {
  let out = '';
  let i = 0;
  for (; i < src.length; ) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (let k = i; k < stop; k++) out += src[k] === '\n' ? '\n' : ' ';
      i = stop;
      continue;
    }
    if (c === '/' && d === '/') {
      const end = src.indexOf('\n', i);
      i = end < 0 ? src.length : end;
      continue;
    }
    // Copy string bodies verbatim — a quote inside a comment is not a string,
    // which is the whole reason comments go first.
    if (c === '"' || c === "'" || c === '`') {
      out += c;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') {
          out += src[i];
          i++;
        }
        if (i < src.length) {
          out += src[i];
          i++;
        }
      }
      if (i < src.length) {
        out += src[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

let hits = 0;
for (const file of walk(ROOT)) {
  const rel = relative(resolve('.'), file).replace(/\\/g, '/');
  if (EXEMPT.test(rel)) continue;
  stripComments(readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((line, idx) => {
      if (!CJK.test(line)) return;
      hits++;
      console.log(`${rel}:${idx + 1}: ${line.trim().slice(0, 100)}`);
    });
}

if (hits) {
  console.log(`\n${hits} line(s) hold CJK text outside src/i18n/.`);
  process.exit(1);
}
console.log('clean: no CJK outside src/i18n/');
