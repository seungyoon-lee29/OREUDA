// geo.ts pathProgress 진행률 계산 경계 검증 — node --test src/lib/geo.test.js
// ponytail: TS 컴파일러 없이 node --test 실행 — 로직 미러링. 실제 소스: geo.ts pathProgress
import { test } from 'node:test';
import assert from 'node:assert/strict';

const haversineM = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const pathProgress = (path, lat, lng) => {
  if (path.length < 2) return { frac: 0, offM: Infinity };
  const kx = Math.cos((lat * Math.PI) / 180);
  const Px = lng * kx;
  const Py = lat;
  const seg = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineM(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
    seg.push(d);
    total += d;
  }
  if (total === 0) return { frac: 0, offM: haversineM(lat, lng, path[0][1], path[0][0]) };
  let bestD2 = Infinity;
  let bestCum = 0;
  let bestProjLat = path[0][1];
  let bestProjLng = path[0][0];
  let cum = 0;
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][0] * kx, ay = path[i - 1][1];
    const bx = path[i][0] * kx, by = path[i][1];
    const abx = bx - ax, aby = by - ay;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 > 0 ? ((Px - ax) * abx + (Py - ay) * aby) / ab2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = Px - (ax + abx * t), dy = Py - (ay + aby * t);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestCum = cum + seg[i - 1] * t;
      bestProjLat = ay + aby * t;
      bestProjLng = (ax + abx * t) / kx;
    }
    cum += seg[i - 1];
  }
  const f = bestCum / total;
  return { frac: f < 0 ? 0 : f > 1 ? 1 : f, offM: haversineM(lat, lng, bestProjLat, bestProjLng) };
};

test('진행률: 들머리=0, 정상=1, 중간≈0.5 (경로 위 → offM≈0)', () => {
  const path = [[126.95, 37.58], [126.95, 37.59], [126.95, 37.60]]; // 남향 직선(들머리→정상)
  const start = pathProgress(path, 37.58, 126.95);
  const end = pathProgress(path, 37.60, 126.95);
  const mid = pathProgress(path, 37.59, 126.95);
  assert.equal(start.frac, 0);
  assert.equal(end.frac, 1);
  assert.ok(Math.abs(mid.frac - 0.5) < 0.01, `mid=${mid.frac}`);
  assert.ok(start.offM < 1 && mid.offM < 1, `offM start=${start.offM} mid=${mid.offM}`);
});

test('진행률: 코스 이탈점은 최근접 세그먼트로 투영, offM로 이탈거리 노출', () => {
  const path = [[126.95, 37.58], [126.95, 37.60]];
  const off = pathProgress(path, 37.59, 126.96); // 동쪽으로 ~880m 벗어남 → frac ~0.5, offM 큼
  assert.ok(Math.abs(off.frac - 0.5) < 0.02, `frac=${off.frac}`);
  assert.ok(off.offM > 700 && off.offM < 1100, `offM=${off.offM}`);
});

test('진행률: 정상 지나쳐도 frac 1로 클램프', () => {
  const path = [[126.95, 37.58], [126.95, 37.60]];
  assert.equal(pathProgress(path, 37.62, 126.95).frac, 1);
});

test('진행률: 코스에서 멀면(딴 산) offM 매우 큼 → 호출부가 라인 숨김', () => {
  const path = [[126.95, 37.58], [126.95, 37.60]]; // 인왕 부근
  const far = pathProgress(path, 37.474, 127.08); // 대모산 부근 ~12km
  assert.ok(far.offM > 5000, `offM=${far.offM}`);
});
