/**
 * Sherset Omborchi ikonkasi — ko'p o'lchamli .ico (PNG ichli) generatori.
 * Kutubxonasiz: PNG'ni zlib + qo'lda CRC32 bilan yozadi.
 * Dizayn: to'q slate yumaloq kvadrat fon + amber karton quti (qopqoq chizig'i
 * va oq lenta) — «ombor» ma'nosi, kassa ikonkasidan aniq farq qiladi.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// ── CRC32 ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Rasm chizish ──
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const S = size;
  const put = (x, y, r, g, b, a = 255) => {
    const i = (y * S + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  const R = S * 0.22; // fon burchak radiusi
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, R), S - 1 - R);
    const cy = Math.min(Math.max(y, R), S - 1 - R);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= R * R;
  };
  // Quti geometriyasi (nisbiy)
  const bx0 = Math.round(S * 0.22);
  const bx1 = Math.round(S * 0.78);
  const by0 = Math.round(S * 0.3);
  const by1 = Math.round(S * 0.78);
  const lidH = Math.max(1, Math.round(S * 0.1)); // qopqoq chizig'i
  const tapeW = Math.max(1, Math.round(S * 0.09)); // oq lenta
  const tx0 = Math.round((bx0 + bx1) / 2 - tapeW / 2);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inRounded(x, y)) {
        put(x, y, 0, 0, 0, 0);
        continue;
      }
      // fon — to'q slate
      let [r, g, b] = [15, 23, 42]; // #0f172a
      if (x >= bx0 && x < bx1 && y >= by0 && y < by1) {
        if (y < by0 + lidH) {
          [r, g, b] = [180, 83, 9]; // qopqoq #b45309
        } else if (x >= tx0 && x < tx0 + tapeW) {
          [r, g, b] = [254, 243, 199]; // lenta #fef3c7
        } else {
          [r, g, b] = [245, 158, 11]; // quti #f59e0b
        }
      }
      put(x, y, r, g, b, 255);
    }
  }
  return px;
}

// ── ICO yig'ish ──
const sizes = [16, 32, 48, 256];
const pngs = sizes.map((s) => encodePng(s, draw(s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // ICO
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = 6 + sizes.length * 16;
for (let i = 0; i < sizes.length; i++) {
  const e = Buffer.alloc(16);
  e[0] = sizes[i] === 256 ? 0 : sizes[i];
  e[1] = sizes[i] === 256 ? 0 : sizes[i];
  e[2] = 0; // palette
  e[3] = 0;
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
}
const out = Buffer.concat([header, ...entries, ...pngs]);
const target = path.join('D:', 'sherset-v2', 'desktop', 'build', 'icon-omborchi.ico');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
console.log('yozildi:', target, out.length, 'bayt');
