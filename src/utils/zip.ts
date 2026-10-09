/**
 * A ZIP writer, for exactly one job: packing an OOXML workbook.
 *
 * STORE only — no deflate. An `.xlsx` from this app is a few kB of XML whose
 * content is a parts list, so compression would save a couple of kB and cost a
 * compressor: either a dependency (fflate is in the tree, but only as a
 * transitive one through three-stdlib and troika-three-text, so importing it
 * would be using a package this project never declared) or a few hundred lines
 * of Huffman coding. Uncompressed entries are legal ZIP and every reader takes
 * them, Excel included.
 *
 * The CRC is not optional. A ZIP's CRC-32 is what the reader checks BEFORE it
 * parses anything, and Excel's failure mode for a wrong one is a flat "the file
 * is corrupt" with no further detail — so this table is the whole reason the
 * file opens.
 */

/** The standard CRC-32 (IEEE 802.3, polynomial 0xEDB88320) lookup table. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A fixed DOS timestamp: 1980-01-01 00:00 (the format's own epoch, since it has
 * no way to express anything earlier).
 *
 * Frozen rather than `new Date()` so that exporting the same BOM twice produces
 * byte-identical files. A build stamp in a container nobody reads is a
 * difference for its own sake, and it makes the output untestable by comparison.
 */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** Little-endian writes into a byte cursor. */
class ByteWriter {
  private readonly view: DataView;
  private readonly bytes: Uint8Array;
  private at = 0;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }

  u16(v: number): void {
    this.view.setUint16(this.at, v, true);
    this.at += 2;
  }

  u32(v: number): void {
    this.view.setUint32(this.at, v >>> 0, true);
    this.at += 4;
  }

  raw(data: Uint8Array): void {
    this.bytes.set(data, this.at);
    this.at += data.length;
  }

  done(): Uint8Array {
    return this.bytes;
  }
}

export interface ZipEntry {
  /** Path inside the archive, `/`-separated, ASCII. */
  name: string;
  data: Uint8Array;
}

/**
 * Pack entries into a ZIP archive, uncompressed, in the order given.
 *
 * The layout is the flat one: every local header, then the central directory,
 * then the end record. No `data descriptor` (sizes are known before writing,
 * so the flag that defers them is unnecessary) and no ZIP64 (the fields that
 * would overflow — 4 GB per entry, 65535 entries — are unreachable from a BOM).
 */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const names = entries.map((e) => enc.encode(e.name));

  const localSize = entries.reduce((n, e, i) => n + 30 + names[i].length + e.data.length, 0);
  const centralSize = entries.reduce((n, _e, i) => n + 46 + names[i].length, 0);

  const w = new ByteWriter(localSize + centralSize + 22);

  // Where each local header starts, which is what the central directory points
  // back at. Known up front because every entry's size is known up front.
  const offsets: number[] = [];
  for (let i = 0, at = 0; i < entries.length; i++) {
    offsets[i] = at;
    at += 30 + names[i].length + entries[i].data.length;
  }

  // --- local file headers, each followed by its data ---
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    w.u32(0x04034b50);        // signature
    w.u16(20);                // version needed
    w.u16(0);                 // flags
    w.u16(0);                 // method: 0 = stored
    w.u16(DOS_TIME);
    w.u16(DOS_DATE);
    w.u32(crc32(e.data));
    w.u32(e.data.length);     // compressed size == uncompressed, stored
    w.u32(e.data.length);
    w.u16(names[i].length);
    w.u16(0);                 // extra field length
    w.raw(names[i]);
    w.raw(e.data);
  }

  // --- central directory ---
  const centralAt = localSize;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    w.u32(0x02014b50);
    w.u16(20);                // version made by
    w.u16(20);                // version needed
    w.u16(0);
    w.u16(0);
    w.u16(DOS_TIME);
    w.u16(DOS_DATE);
    w.u32(crc32(e.data));
    w.u32(e.data.length);
    w.u32(e.data.length);
    w.u16(names[i].length);
    w.u16(0);                 // extra
    w.u16(0);                 // comment
    w.u16(0);                 // disk number
    w.u16(0);                 // internal attributes
    w.u32(0);                 // external attributes
    w.u32(offsets[i]);
    w.raw(names[i]);
  }

  // --- end of central directory ---
  w.u32(0x06054b50);
  w.u16(0);                   // this disk
  w.u16(0);                   // disk with the central directory
  w.u16(entries.length);
  w.u16(entries.length);
  w.u32(centralSize);
  w.u32(centralAt);
  w.u16(0);                   // comment length

  return w.done();
}
