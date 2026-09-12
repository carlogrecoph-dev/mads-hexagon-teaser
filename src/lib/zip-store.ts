/** ZIP (store only) so we can ship a .app without extra libraries. */

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}
function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

export type ZipEntry = { name: string; data: Uint8Array<ArrayBufferLike>; unixMode?: number };

export function zipStore(files: ZipEntry[]): Blob {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const file of files) {
    const name = enc.encode(file.name.replace(/\\/g, "/"));
    const data = file.data;
    const crc = crc32(data);
    const mode = file.unixMode ?? 0o100644;
    const ext = (mode & 0xffff) << 16;
    const local = [
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ];
    const localBuf = concat(local);
    const central = concat([
      u32(0x02014b50),
      u16(0x0317),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(ext),
      u32(offset),
      name,
    ]);
    locals.push(localBuf);
    centrals.push(central);
    offset += localBuf.length;
  }

  const localAll = concat(locals);
  const centralAll = concat(centrals);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralAll.length),
    u32(localAll.length),
    u16(0),
  ]);
  return new Blob([localAll, centralAll, eocd], { type: "application/zip" });
}

function concat(parts: Uint8Array[]) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Minimal ICNS wrapping a 512×512 PNG. */
export function pngToIcns(png: Uint8Array) {
  const type = new TextEncoder().encode("ic09");
  const innerLen = 8 + png.length;
  const total = 8 + innerLen;
  const out = new Uint8Array(total);
  out.set(new TextEncoder().encode("icns"), 0);
  new DataView(out.buffer).setUint32(4, total);
  out.set(type, 8);
  new DataView(out.buffer).setUint32(12, innerLen);
  out.set(png, 16);
  return out;
}
