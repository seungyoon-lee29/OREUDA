// hikeStats.ts 운동요약 계산 경계 검증 — node --test src/lib/hikeStats.test.js
// ponytail: TS 컴파일러 없이 node --test 실행 — 로직을 여기 미러링. 실제 소스: hikeStats.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ASSUMED_WEIGHT_KG = 65;

const hikingMet = (speedKmh, gradientPct) => {
  const s = speedKmh ?? 4;
  const base = s < 3.2 ? 2.8 : s < 4.8 ? 3.5 : s < 5.6 ? 4.3 : s < 6.4 ? 5.0 : 6.0;
  const gradeBump = gradientPct == null ? 1.5 : Math.min(gradientPct, 30) * 0.15;
  return base + gradeBump;
};

const computeHikeSummary = (input) => {
  const durationMs = input.endedAtMs - Date.parse(input.startedAt);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const durationMin = Math.round(durationMs / 60_000);
  const hours = durationMs / 3_600_000;
  const distanceM = input.distanceM;
  const rawSpeed = distanceM != null && distanceM > 0 ? distanceM / 1000 / hours : null;
  const avgSpeedKmh = rawSpeed != null && rawSpeed <= 12 ? Math.round(rawSpeed * 10) / 10 : null;
  const ascentM =
    input.startAltitude != null && input.endAltitude != null
      ? Math.max(0, Math.round(input.endAltitude - input.startAltitude))
      : null;
  const gradientPct =
    ascentM != null && distanceM != null && distanceM > 0
      ? Math.round((ascentM / distanceM) * 100 * 10) / 10
      : null;
  const met = hikingMet(avgSpeedKmh, gradientPct);
  const calories = Math.round(met * (input.weightKg ?? ASSUMED_WEIGHT_KG) * hours);
  return { durationMin, distanceM, avgSpeedKmh, ascentM, gradientPct, calories };
};

const base = {
  startedAt: '2026-07-14T00:00:00.000Z',
  endedAtMs: Date.parse('2026-07-14T01:00:00.000Z'), // 정확히 60분
  distanceM: 3000,
  startAltitude: 100,
  endAltitude: 400,
};

test('경과시간 0 이하 → null (요약 없음)', () => {
  assert.equal(computeHikeSummary({ ...base, endedAtMs: Date.parse(base.startedAt) }), null);
  assert.equal(computeHikeSummary({ ...base, endedAtMs: Date.parse(base.startedAt) - 1000 }), null);
});

test('60분 3km → 속도 3.0km/h, 시간 60분', () => {
  const r = computeHikeSummary(base);
  assert.equal(r.durationMin, 60);
  assert.equal(r.avgSpeedKmh, 3.0);
});

test('상승 = 정상-시작 고도, 음수는 0 클램프', () => {
  assert.equal(computeHikeSummary(base).ascentM, 300);
  assert.equal(computeHikeSummary({ ...base, startAltitude: 400, endAltitude: 100 }).ascentM, 0);
});

test('경사도 = 상승/거리 (300m / 3000m = 10.0%)', () => {
  assert.equal(computeHikeSummary(base).gradientPct, 10.0);
});

test('고도 하나라도 없으면 경사도·상승 null', () => {
  assert.equal(computeHikeSummary({ ...base, startAltitude: null }).gradientPct, null);
  assert.equal(computeHikeSummary({ ...base, endAltitude: null }).ascentM, null);
});

test('거리 없으면 속도·경사도 null, 칼로리는 계산됨', () => {
  const r = computeHikeSummary({ ...base, distanceM: null });
  assert.equal(r.avgSpeedKmh, null);
  assert.equal(r.gradientPct, null);
  assert.ok(r.calories > 0);
});

test('비현실 속도(너무 짧은 등반)는 미표시 — 1분에 3km면 180km/h → null', () => {
  const r = computeHikeSummary({ ...base, endedAtMs: Date.parse(base.startedAt) + 60_000 });
  assert.equal(r.avgSpeedKmh, null); // 12km/h 상한 초과
});

test('MET 속도 경계: 3.2/4.8/5.6/6.4 km/h 계단', () => {
  assert.equal(hikingMet(3.1, null), 2.8 + 1.5);
  assert.equal(hikingMet(3.2, null), 3.5 + 1.5);
  assert.equal(hikingMet(4.8, null), 4.3 + 1.5);
  assert.equal(hikingMet(6.4, null), 6.0 + 1.5);
});

test('MET 경사 가산: 미상=+1.5, 20%=+3.0, 40%는 30% 상한=+4.5', () => {
  assert.equal(hikingMet(4, null), 3.5 + 1.5);
  assert.equal(hikingMet(4, 20), 3.5 + 3.0);
  assert.equal(hikingMet(4, 40), 3.5 + 4.5);
});

test('칼로리 = MET×65kg×시간, 60분 3km 10%경사 → 양수 합리값', () => {
  const r = computeHikeSummary(base); // 속도3.0(base2.8)+경사10%(1.5)=4.3 MET ×65×1h
  assert.equal(r.calories, Math.round(4.3 * 65));
});
