// courseProgress.ts 경로 투영 경계 검증 — node --test src/lib/courseProgress.test.js
// ponytail: TS 컴파일 없이 실행하려 로직 미러링. 실제 소스: courseProgress.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = 6371000;
const DEG_M = (Math.PI / 180) * R;
const haversineM = (lat1, lng1, lat2, lng2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const buildCoursePath = (coords, officialTotalM) => {
  if (!coords || coords.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const [aLng, aLat] = coords[i - 1];
    const [bLng, bLat] = coords[i];
    cum.push(cum[i - 1] + haversineM(aLat, aLng, bLat, bLng));
  }
  const geomTotalM = cum[cum.length - 1];
  if (geomTotalM <= 0) return null;
  const totalM = officialTotalM && officialTotalM > 0 ? officialTotalM : geomTotalM;
  return { coords, cum, geomTotalM, totalM };
};

const projectOnCourse = (idx, lat, lng) => {
  let best = { off2: Infinity, progressGeom: 0 };
  for (let i = 1; i < idx.coords.length; i++) {
    const [aLng, aLat] = idx.coords[i - 1];
    const [bLng, bLat] = idx.coords[i];
    const kx = DEG_M * Math.cos((aLat * Math.PI) / 180);
    const bx = (bLng - aLng) * kx;
    const by = (bLat - aLat) * DEG_M;
    const px = (lng - aLng) * kx;
    const py = (lat - aLat) * DEG_M;
    const segLen2 = bx * bx + by * by;
    const t = segLen2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / segLen2)) : 0;
    const dx = px - t * bx;
    const dy = py - t * by;
    const off2 = dx * dx + dy * dy;
    if (off2 < best.off2) {
      const segM = idx.cum[i] - idx.cum[i - 1];
      best = { off2, progressGeom: idx.cum[i - 1] + t * segM };
    }
  }
  const fraction = Math.max(0, Math.min(1, best.progressGeom / idx.geomTotalM));
  const progressM = idx.totalM * fraction;
  return { fraction, progressM, remainingM: idx.totalM - progressM, totalM: idx.totalM, offCourseM: Math.sqrt(best.off2) };
};

// 정북 직선 코스: [lng,lat] 세 정점, 각 0.01도(≈1112m), 총 ≈2224m
const LINE = [
  [127.0, 37.0],
  [127.0, 37.01],
  [127.0, 37.02],
];

test('빈/1점 경로는 null (투영 불가)', () => {
  assert.equal(buildCoursePath([]), null);
  assert.equal(buildCoursePath([[127, 37]]), null);
  assert.equal(buildCoursePath([[127, 37], [127, 37]]), null); // 총길이 0
});

test('시작점 → fraction 0, 잔여 ≈ 총거리', () => {
  const idx = buildCoursePath(LINE);
  const r = projectOnCourse(idx, 37.0, 127.0);
  assert.equal(r.fraction, 0);
  assert.ok(Math.abs(r.remainingM - r.totalM) < 1);
});

test('종점 너머 → 마지막 정점에 클램프, fraction 1, 잔여 0', () => {
  const idx = buildCoursePath(LINE);
  const r = projectOnCourse(idx, 37.03, 127.0); // 종점(37.02) 지나침
  assert.equal(r.fraction, 1);
  assert.ok(Math.abs(r.remainingM) < 1);
});

test('중점 → fraction 0.5', () => {
  const idx = buildCoursePath(LINE);
  const r = projectOnCourse(idx, 37.01, 127.0);
  assert.ok(Math.abs(r.fraction - 0.5) < 0.001);
});

test('경로 옆(이탈) → 진행률은 유지되고 offCourseM에 수직거리 반영', () => {
  const idx = buildCoursePath(LINE);
  // 중점에서 동쪽 0.001도 벗어남 ≈ 0.001*DEG_M*cos(37) ≈ 88.7m
  const r = projectOnCourse(idx, 37.01, 127.001);
  assert.ok(Math.abs(r.fraction - 0.5) < 0.001, 'fraction 유지');
  const expectOff = 0.001 * DEG_M * Math.cos((37 * Math.PI) / 180);
  assert.ok(Math.abs(r.offCourseM - expectOff) < 1, `offCourseM≈${expectOff.toFixed(0)}m`);
});

test('원거리(딴 산) → offCourseM 매우 큼 → 배너 숨김 게이트(>1000m) 발동', () => {
  const idx = buildCoursePath(LINE);
  const r = projectOnCourse(idx, 37.0, 127.1); // 코스에서 동쪽 0.1도 ≈ 8.9km
  assert.ok(r.offCourseM > 1000, `offCourseM=${r.offCourseM.toFixed(0)}m — 라인 숨김`);
});

test('역주행/노이즈 무관 — 진행률은 궤적이 아니라 현재 위치 기준', () => {
  const idx = buildCoursePath(LINE);
  const r = projectOnCourse(idx, 37.005, 127.0); // 25% 지점, 어느 방향으로 왔든 동일
  assert.ok(Math.abs(r.fraction - 0.25) < 0.001);
});

test('officialTotalM 주면 진행/잔여를 그 값으로 스케일 (fraction은 기하 기준)', () => {
  const idx = buildCoursePath(LINE, 3000);
  const r = projectOnCourse(idx, 37.01, 127.0); // 중점
  assert.equal(r.totalM, 3000);
  assert.ok(Math.abs(r.progressM - 1500) < 5);
  assert.ok(Math.abs(r.remainingM - 1500) < 5);
});

test('진행 + 잔여 = 총거리 (드리프트 없음)', () => {
  const idx = buildCoursePath(LINE, 3200);
  const r = projectOnCourse(idx, 37.013, 127.0);
  assert.ok(Math.abs(r.progressM + r.remainingM - 3200) < 0.001);
});
