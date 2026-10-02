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

// ---- police classique (traits + empattements) ----
const ell = (cx, cy, rx, ry, n = 32) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
};
const G = {
  M: { w: 9, p: [[[0,10],[0,0],[4.5,8],[9,0],[9,10]], [[-1,10],[1,10]], [[8,10],[10,10]], [[-1,0],[1,0]], [[8,0],[10,0]]] },
  P: { w: 6, p: [[[0,0],[0,10]], [[0,0],[3.4,0],[5,0.7],[5.7,2.5],[5,4.3],[3.4,5],[0,5]], [[-1,10],[1,10]], [[-1,0],[1,0]]] },
  '*': { w: 5, p: [[[2.5,0.5],[2.5,5.5]], [[0.3,1.75],[4.7,4.25]], [[0.3,4.25],[4.7,1.75]]] },
  J: { w: 5, p: [[[3.5,0],[3.5,7],[3.1,9],[1.9,10],[0.7,9.6],[0.1,8.4]], [[1.5,0],[5.5,0]]] },
  U: { w: 7, p: [[[0,0],[0,6.5],[0.6,8.7],[2.2,9.8],[3.5,10],[4.8,9.8],[6.4,8.7],[7,6.5],[7,0]], [[-1,0],[1,0]], [[6,0],[8,0]]] },
  I: { w: 3, p: [[[1.5,0],[1.5,10]], [[0,0],[3,0]], [[0,10],[3,10]]] },
  N: { w: 8, p: [[[0,10],[0,0],[8,10],[8,0]], [[-1,10],[1,10]], [[-1,0],[1,0]], [[7,0],[9,0]], [[7,10],[9,10]]] },
  '1': { w: 4, p: [[[0.3,2.2],[2.4,0],[2.4,10]], [[0.2,10],[4.6,10]]] },
  '0': { w: 6, p: [ell(3, 5, 3, 5)] },
  '2': { w: 6, p: [[[0.1,2.4],[0.9,0.8],[2.7,0],[4.6,0.7],[5.3,2.4],[4.6,4.3],[0,10],[5.6,10]]] },
  '7': { w: 6, p: [[[0,0],[5.8,0],[1.9,10]]] },
  ' ': { w: 3.5, p: [] },
};
const GAP = 2.6;

module.exports = (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const W = Math.min(+q.get('w') || 1179, 2000);
  const H = Math.min(+q.get('h') || 2556, 3000);
  const k = W / 1179;
  const stride = W + 1;
  const raw = Buffer.alloc(stride * H); // tout noir

  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * stride + 1 + x;
    if (v > raw[i]) raw[i] = v;
  };

  const seg = (x1, y1, x2, y2, w, val) => {
    const r = w / 2 + 1;
    const xa = Math.max(0, Math.floor(Math.min(x1, x2) - r));
    const xb = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + r));
    const ya = Math.max(0, Math.floor(Math.min(y1, y2) - r));
    const yb = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + r));
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        let t = l2 ? ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(x + 0.5 - (x1 + t * dx), y + 0.5 - (y1 + t * dy));
        const v = Math.max(0, Math.min(1, w / 2 + 0.5 - d));
        if (v > 0) set(x, y, Math.round(v * val));
      }
    }
  };

  const textW = (str, s) => {
    let u = 0;
    for (const c of str) u += G[c].w + GAP;
    return (u - GAP) * s;
  };
  const text = (str, cx, top, s, w, val) => {
    let x = cx - textW(str, s) / 2;
    for (const c of str) {
      for (const poly of G[c].p) {
        for (let i = 0; i < poly.length - 1; i++) {
          seg(x + poly[i][0] * s, top + poly[i][1] * s, x + poly[i + 1][0] * s, top + poly[i + 1][1] * s, w, val);
        }
      }
      x += (G[c].w + GAP) * s;
    }
  };

  // ---- jours ----
  const DAY = 86400000;
  const START = Date.UTC(2026, 9, 2);  // 2 octobre 2026
  const END = Date.UTC(2027, 5, 10);   // 10 juin 2027
  const total = Math.round((END - START) / DAY) + 1;
  const now = new Date(Date.now() - 4 * 3600 * 1000); // heure Guadeloupe
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const done = Math.max(0, Math.min(total, Math.round((today - START) / DAY) + 1));

  // ---- calendrier ----
  const COLS = 14;
  const pitch = Math.floor((W * 0.78) / COLS);
  const r = pitch * 0.26;
  const t = Math.max(2, pitch * 0.05);
  const x0 = Math.round((W - COLS * pitch) / 2);
  const gridTop = Math.round(H * 0.38);
  const rows = Math.ceil(total / COLS);

  for (let i = 0; i < total; i++) {
    const filled = i < done;
    const cx = x0 + (i % COLS) * pitch + pitch / 2;
    const cy = gridTop + Math.floor(i / COLS) * pitch + pitch / 2;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const outer = Math.max(0, Math.min(1, r + 0.5 - d));
        const inner = filled ? 0 : Math.max(0, Math.min(1, r - t + 0.5 - d));
        const v = outer - inner;
        if (v > 0) set(x, y, Math.round(v * 255));
      }
    }
  }

  // ---- MP* au-dessus du calendrier ----
  const s1 = 6.4 * k;
  text('MP*', W / 2, gridTop - 60 * k - 10 * s1, s1, s1 * 0.8, 255);

  // ---- date en dessous, opacité 50 % ----
  const s2 = 3.4 * k;
  text('10 JUIN 2027', W / 2, gridTop + rows * pitch + 50 * k, s2, s2 * 0.8, 128);

  // ---- PNG ----
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
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
