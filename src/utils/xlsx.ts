/**
 * A single-sheet `.xlsx` writer, sized for a parts list.
 *
 * An OOXML workbook is a ZIP of XML parts, and this builds the six a reader
 * actually needs: content types, the package relationship, the workbook, the
 * workbook's relationships, the styles, and the one worksheet. It is
 * deliberately not a spreadsheet library — there is no shared-string table,
 * no theme, no shared formulas, and the only two cell styles that exist are
 * "default" and "bold".
 *
 * Two choices worth knowing about before editing:
 *
 *   INLINE STRINGS, not `xl/sharedStrings.xml`. A shared-string table exists to
 *   store a repeated string once, and the strings a BOM repeats (the profile
 *   size, the article number) are ten bytes each. Sharing them would buy a
 *   seventh part plus a map from string to index and a second pass to write it,
 *   in exchange for a few hundred bytes in a file nobody stores.
 *
 *   NUMBERS ARE NUMBERS. A cell holding a number is written as a number, so the
 *   quantity column comes back as `int` and a reader can sum it — which is the
 *   entire reason to prefer this over the CSV. Text is never written as a number
 *   even when it looks like one, which is why an article number needs no `@`
 *   format to protect it: `inlineStr` cannot be parsed as anything else.
 */

import { zipStore, type ZipEntry } from './zip';

/** `null` leaves the cell out entirely, which is how a row stays sparse. */
export type Cell = string | number | null;

export interface SheetSpec {
  /** Worksheet tab. Sanitised, since Excel rejects several characters in one. */
  name: string;
  /** Row 1, bold and frozen. */
  header: string[];
  /** Data rows, below the header. */
  rows: Cell[][];
  /** A trailing block under the data: a bold heading and unnumbered lines. */
  ops?: { label: string; items: string[] };
  /** Lines after everything else, in column A. */
  footer?: string[];
  /** Column widths in Excel's character units, by column index. */
  colWidths?: number[];
}

// ============================================================ XML plumbing

/**
 * Escape text for an XML text node, and drop what XML cannot carry at all.
 *
 * The C0 controls other than tab/LF/CR are not legal in an XML 1.0 document at
 * ANY escaping, so one pasted control character in a remark is a workbook that
 * will not open. Everything here is user-visible copy, so the odds are low —
 * but the cost of the guard is this comment, and the cost of not having it is
 * a file that fails with no explanation.
 */
function esc(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A1-style column name for a zero-based index: 0 → A, 25 → Z, 26 → AA. */
function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

/** Cell reference, e.g. `B7`. */
function ref(col: number, row: number): string {
  return `${colName(col)}${row}`;
}

/**
 * A worksheet tab Excel will accept: no `: \ / ? * [ ]`, not blank, at most 31
 * characters. The caller passes a constant, so this normally does nothing —
 * which is the point, since the alternative is a workbook that opens to an
 * error dialog for a reason invisible in the source.
 */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
  return cleaned || 'Sheet1';
}

// ============================================================ the parts

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function contentTypesXml(): string {
  return `${DECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function rootRelsXml(): string {
  return `${DECL}
<Relationships xmlns="${NS_PKG_REL}">
<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheetName: string): string {
  return `${DECL}
<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function workbookRelsXml(): string {
  return `${DECL}
<Relationships xmlns="${NS_PKG_REL}">
<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>
</Relationships>`;
}

/**
 * Two cell formats and nothing else: index 0 is what every cell gets by
 * default, index 1 is bold (the header row and the 加工要求 heading).
 *
 * The `<fills>` pair is not decoration — Excel requires a `count` of at least
 * two with `none` at 0 and `gray125` at 1 specifically, a quirk inherited from
 * the format's history. A single fill entry produces a file Excel refuses with
 * a repair prompt.
 *
 * Fonts carry no `<color>`, which would have to be a theme reference, and a
 * theme part is one more thing to ship for a colour that is the default anyway.
 */
function stylesXml(): string {
  return `${DECL}
<styleSheet xmlns="${NS_MAIN}">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="2">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

const BOLD = 1;

function cellXml(col: number, row: number, cell: Cell, style: number): string {
  if (cell === null || cell === '') return '';
  const r = ref(col, row);
  const s = style ? ` s="${style}"` : '';
  // A non-finite number has no XML spelling; text is the honest fallback.
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<c r="${r}"${s}><v>${cell}</v></c>`;
  }
  // `xml:space="preserve"` because a label with a leading or trailing space is
  // meaningful here (`bom.textTotal` has two leading spaces) and would silently
  // lose them otherwise.
  return `<c r="${r}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(cell))}</t></is></c>`;
}

function rowXml(row: number, cells: Cell[], style = 0): string {
  const inner = cells.map((c, i) => cellXml(i, row, c, style)).join('');
  return inner ? `<row r="${row}">${inner}</row>` : `<row r="${row}"/>`;
}

function colsXml(widths: number[]): string {
  const cols = widths
    .map((w, i) =>
      w > 0 ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : '')
    .join('');
  return cols ? `<cols>${cols}</cols>` : '';
}

function sheetXml(spec: SheetSpec): string {
  const lines: string[] = [];
  let row = 1;

  lines.push(rowXml(row++, spec.header, BOLD));
  for (const r of spec.rows) lines.push(rowXml(row++, r));

  // The remark block sits BELOW the data as prose in column A, never in the
  // quantity column — a total under a column of counts is a column a reader
  // cannot sum without excluding a line they cannot see.
  if (spec.ops && spec.ops.items.length > 0) {
    lines.push(`<row r="${row++}"/>`);
    lines.push(rowXml(row++, [spec.ops.label], BOLD));
    for (const item of spec.ops.items) lines.push(rowXml(row++, [item]));
  }

  if (spec.footer && spec.footer.length > 0) {
    lines.push(`<row r="${row++}"/>`);
    for (const line of spec.footer) lines.push(rowXml(row++, [line]));
  }

  return `${DECL}
<worksheet xmlns="${NS_MAIN}">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${colsXml(spec.colWidths ?? [])}
<sheetData>
${lines.join('\n')}
</sheetData>
</worksheet>`;
}

// ============================================================ the package

/** Build an `.xlsx` workbook holding one worksheet, as bytes. */
export function buildXlsx(spec: SheetSpec): Uint8Array {
  const name = safeSheetName(spec.name);
  const enc = new TextEncoder();
  const part = (p: string, xml: string): ZipEntry => ({ name: p, data: enc.encode(xml) });

  return zipStore([
    part('[Content_Types].xml', contentTypesXml()),
    part('_rels/.rels', rootRelsXml()),
    part('xl/workbook.xml', workbookXml(name)),
    part('xl/_rels/workbook.xml.rels', workbookRelsXml()),
    part('xl/styles.xml', stylesXml()),
    part('xl/worksheets/sheet1.xml', sheetXml(spec)),
  ]);
}
