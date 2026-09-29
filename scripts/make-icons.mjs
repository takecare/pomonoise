// Generates the menubar template icons (black + alpha, as macOS expects).
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = (size - 1) / 2, outer = size * 0.42, inner = size * 0.30;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      // Ring, plus a small stem-like tick at the top (a timer).
      const ring = d <= outer && d >= inner;
      const hand = Math.abs(x - c) < size * 0.05 && y <= c && y >= size * 0.25;
      const a = ring || hand ? 255 : 0;
      raw.writeUInt32BE(a, y * (size * 4 + 1) + 1 + x * 4); // r,g,b = 0, a
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('assets/trayTemplate.png', png(18));
writeFileSync('assets/trayTemplate@2x.png', png(36));
