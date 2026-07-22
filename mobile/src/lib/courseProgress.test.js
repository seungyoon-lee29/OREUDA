// courseProgress.ts 경로 투영 경계 검증 — node --test src/lib/courseProgress.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoursePath, projectOnCourse } from './courseProgress.ts';

// R/DEG_M: 소스와 별개로 기대값(offCourseM) 직접 계산용 테스트 픽스처 — SUT 아님.
const R = 6371000;
const DEG_M = (Math.PI / 180) * R;

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
