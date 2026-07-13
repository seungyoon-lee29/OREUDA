// 오르다 앱 아이콘 생성기 — 인앱 Logo 마크(초록 봉우리 + 흰 ∧ 획)와 동일 기하.
// 순수 Node(zlib만) — SVG 래스터라이저/ImageMagick/sharp 없이 RGBA→PNG 직접 인코딩.
// 4x4 슈퍼샘플로 에지 안티앨리어싱. 재실행: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

// Summit Precision 토큰
const GRANITE = [26, 28, 30];   // C.bg #1A1C1E
const GREEN = [46, 204, 113];   // C.success #2ECC71
const WHITE = [255, 255, 255];
const BORDER = [52, 58, 64];    // C.border (미완등 윤곽 — 안 씀, 참고)

// 단위 마크(폭=1, 봉우리 비율 1.15:1). apex 위, base 아래.
const H = 1 / 1.15;             // 삼각형 높이(폭 대비)
const TRI = [[0.5, 0], [0, H], [1, H]];               // 꼭짓점(단위)
const CH_APEX = [0.5, 0.44];    // ∧ 획 꼭지
const CH_ARM = 0.25, CH_DROP = 0.20, CH_HALF = 0.052; // 팔 길이/처짐/획 반두께(단위폭)

function edge(ax, ay, bx, by, px, py) { return (bx - ax) * (py - ay) - (by - ay) * (px - ax); }
function inTri(px, py, t) {
  const d1 = edge(t[0][0], t[0][1], t[1][0], t[1][1], px, py);
  const d2 = edge(t[1][0], t[1][1], t[2][0], t[2][1], px, py);
  const d3 = edge(t[2][0], t[2][1], t[0][0], t[0][1], px, py);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// markFrac: 마크가 캔버스 폭에서 차지하는 비율. opaque: 배경 채움 여부. mono: 흰 실루엣.
function render(size, { markFrac = 0.62, opaque = true, mono = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const T = markFrac * size;
  const left = (size - T) / 2;
  const top = (size - H * T) / 2;
  const toPx = (u, v) => [left + u * T, top + v * T];
  const tri = TRI.map(([u, v]) => toPx(u, v));
  const [chx, chy] = toPx(...CH_APEX);
  const [lx, ly] = toPx(CH_APEX[0] - CH_ARM, CH_APEX[1] + CH_DROP);
  const [rx, ry] = toPx(CH_APEX[0] + CH_ARM, CH_APEX[1] + CH_DROP);
  const chHalf = CH_HALF * T;
  const SS = 4, inv = 1 / (SS * SS);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
        let col, al;
        const insideTri = inTri(px, py, tri);
        const onChevron = !mono && (segDist(px, py, chx, chy, lx, ly) <= chHalf ||
          segDist(px, py, chx, chy, rx, ry) <= chHalf);
        if (onChevron && insideTri) { col = WHITE; al = 255; }
        else if (insideTri) { col = mono ? WHITE : GREEN; al = 255; }
        else if (opaque) { col = GRANITE; al = 255; }
        else { col = GRANITE; al = 0; }
        r += col[0] * al; g += col[1] * al; b += col[2] * al; a += al;
      }
      // 프리멀티플라이 누적(r=Σcol*al) → 스트레이트 색 = r/a (이미 0–255)
      const A = a * inv;
      const o = (y * size + x) * 4;
      buf[o] = a ? Math.round(r / a) : 0;
      buf[o + 1] = a ? Math.round(g / a) : 0;
      buf[o + 2] = a ? Math.round(b / a) : 0;
      buf[o + 3] = Math.round(A);
    }
  }
  return buf;
}

// ── 최소 RGBA PNG 인코더
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
// alpha=false면 RGB(color type 2)로 인코딩 — iOS 앱 아이콘은 알파 채널 금지(스토어 거부).
function encodePNG(rgba, size, alpha) {
  const ch = alpha ? 4 : 3;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  const row = size * ch + 1;
  const raw = Buffer.alloc(size * row);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4, d = y * row + 1 + x * ch;
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
      if (alpha) raw[d + 3] = rgba[s + 3];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const save = (name, size, opts) => {
  writeFileSync(join(OUT, name), encodePNG(render(size, opts), size, !opts.opaque));
  console.log('  ✓', name, `${size}²`, opts.opaque ? 'RGB' : 'RGBA', JSON.stringify(opts));
};

console.log('오르다 아이콘 생성 →', OUT);
save('icon.png', 1024, { markFrac: 0.60, opaque: true });                       // iOS/메인 — 불투명 granite
save('splash-icon.png', 1024, { markFrac: 0.42, opaque: false });               // 스플래시 — 투명, granite 위 중앙
save('android-icon-foreground.png', 1024, { markFrac: 0.44, opaque: false });   // 어댑티브 전경(마스크 안전영역)
save('android-icon-background.png', 1024, { markFrac: 0, opaque: true });        // 어댑티브 배경 — 단색 granite
save('android-icon-monochrome.png', 1024, { markFrac: 0.44, opaque: false, mono: true }); // 테마드 아이콘 실루엣
save('favicon.png', 48, { markFrac: 0.66, opaque: true });                      // 웹
console.log('완료.');
