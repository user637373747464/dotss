const zlib = require('zlib');

const T = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  T[n] = c >>> 0;
}
const crc = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

const GLYPHS = {
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  '*': ['00000','00100','10101','01110','10101','00100','00000'],
};

module.exports = (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const W = Math.min(+q.get('w') || 1179, 2000);
  const H = Math.min(+q.get('h') || 2556, 3000);
  const stride = W + 1;
  const raw = Buffer.alloc(stride * H); // tout noir

  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * stride + 1 + x;
    if (v > raw[i]) raw[i] = v;
  };

  // nombre de jours : aujourd'hui (heure Guadeloupe) -> 10 juin 2027
  const now = new Date(Date.now() - 4 * 3600 * 1000);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const END = Date.UTC(2027, 5, 10);
  const n = Math.max(0, Math.round((END - today) / 86400000) + 1);

  // points
  const COLS = 14;
  const pitch = Math.floor((W - 200) / COLS);
  const r = pitch * 0.25;
  const x0 = Math.round((W - COLS * pitch) / 2);
  const y0 = Math.round(H * 0.4);
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i % COLS) * pitch + pitch / 2;
    const cy = y0 + Math.floor(i / COLS) * pitch + pitch / 2;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const v = Math.max(0, Math.min(1, r + 0.5 - dist));
        if (v > 0) set(x, y, Math.round(v * 255));
      }
    }
  }

  // texte MP*
  const s = 9;
  const tw = 17 * s;
  let tx = Math.round((W - tw) / 2);
  const ty = 180;
  for (const ch of 'MP*') {
    GLYPHS[ch].forEach((row, gy) => {
      [...row].forEach((bit, gx) => {
        if (bit === '1') {
          for (let dy = 0; dy < s; dy++)
            for (let dx = 0; dx < s; dx++) set(tx + gx * s + dx, ty + gy * s + dy, 255);
        }
      });
    });
    tx += 6 * s;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 0; // niveaux de gris
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.end(png);
};
