// hikeWidget.ts 위젯 표시 상태 경계 검증 — node --test src/lib/hikeWidget.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHikeWidget } from './hikeWidget.ts';

const prog = (o) => ({ fraction: 0.5, progressM: 1500, remainingM: 1500, totalM: 3000, offCourseM: 0, ...o });
const START = Date.parse('2026-07-19T00:00:00.000Z'); // KST 09:00

test('경과시간 라벨: 60분 미만은 분만, 이상은 시간+분', () => {
  const s = formatHikeWidget({ startedAtMs: START, nowMs: START + 23 * 60_000, progress: prog(), altitude: null });
  assert.equal(s.elapsedLabel, '23분');
  const s2 = formatHikeWidget({ startedAtMs: START, nowMs: START + 83 * 60_000, progress: prog(), altitude: null });
  assert.equal(s2.elapsedLabel, '1시간 23분');
});

test('음수 경과(시계 오차)는 0으로 클램프', () => {
  const s = formatHikeWidget({ startedAtMs: START, nowMs: START - 5000, progress: prog(), altitude: null });
  assert.equal(s.elapsedMin, 0);
});

test('온/남은 km는 소수1자리, 진행률은 0..100 정수', () => {
  const s = formatHikeWidget({ startedAtMs: START, nowMs: START + 3_600_000, progress: prog(), altitude: null });
  assert.equal(s.doneKm, '1.5');
  assert.equal(s.remainingKm, '1.5');
  assert.equal(s.progressPct, 50);
});

test('진행률 반올림·클램프: fraction 0.996→100, 1.2→100, 음수→0', () => {
  assert.equal(formatHikeWidget({ startedAtMs: START, nowMs: START, progress: prog({ fraction: 0.996 }), altitude: null }).progressPct, 100);
  assert.equal(formatHikeWidget({ startedAtMs: START, nowMs: START, progress: prog({ fraction: 1.2 }), altitude: null }).progressPct, 100);
  assert.equal(formatHikeWidget({ startedAtMs: START, nowMs: START, progress: prog({ fraction: -0.1 }), altitude: null }).progressPct, 0);
});

test('도착: 잔여 30m 이내 또는 fraction≥0.999 → arrived, ETA 없음', () => {
  const s = formatHikeWidget({ startedAtMs: START, nowMs: START + 3_600_000, progress: prog({ remainingM: 20, progressM: 2980, fraction: 0.99 }), altitude: 500 });
  assert.equal(s.arrived, true);
  assert.equal(s.etaLabel, null);
  const s2 = formatHikeWidget({ startedAtMs: START, nowMs: START + 3_600_000, progress: prog({ remainingM: 31, progressM: 2969, fraction: 0.99 }), altitude: 500 });
  assert.equal(s2.arrived, false); // 30m 경계: 31m는 아직 도착 아님
});

test('ETA: 60분에 절반(1500m) 왔으면 남은 절반도 60분 → 지금+60분 KST 시계', () => {
  const now = START + 60 * 60_000; // KST 10:00
  const s = formatHikeWidget({ startedAtMs: START, nowMs: now, progress: prog(), altitude: null });
  assert.equal(s.etaLabel, '11:00'); // now(10:00) + 60분
});

test('ETA 미표시: 진행 50m 미만(데이터 부족)', () => {
  const s = formatHikeWidget({ startedAtMs: START, nowMs: START + 60_000, progress: prog({ progressM: 40, remainingM: 2960, fraction: 0.013 }), altitude: null });
  assert.equal(s.etaLabel, null);
});

test('ETA 미표시: 외삽이 16h 초과(페이스 비현실)', () => {
  // 아주 조금(60m) 왔는데 아주 오래(2h) 걸렸다 → 남은 2940m 외삽이 초 단위로 크게 나와 상한 초과
  const s = formatHikeWidget({ startedAtMs: START, nowMs: START + 2 * 3_600_000, progress: prog({ progressM: 60, remainingM: 2940, fraction: 0.02 }), altitude: null });
  assert.equal(s.etaLabel, null);
});

test('고도: 있으면 반올림 m, 없으면 null', () => {
  assert.equal(formatHikeWidget({ startedAtMs: START, nowMs: START, progress: prog(), altitude: 511.6 }).altitudeLabel, '512m');
  assert.equal(formatHikeWidget({ startedAtMs: START, nowMs: START, progress: prog(), altitude: null }).altitudeLabel, null);
});
