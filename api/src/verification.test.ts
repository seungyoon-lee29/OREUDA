import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBbox } from './catalog';
import { capturedAtError, computeFlags } from './climbs';

test('computeFlags — 03 §2', () => {
  // 평시: 반경 내, 정상 속도, mock 아님
  assert.deepEqual(
    computeFlags({ distanceM: 100, radiusM: 150, isMock: false, speedKmh: 50 }),
    [],
  );
  // 경계: distance_m == radius는 통과 (초과만 flag)
  assert.deepEqual(
    computeFlags({ distanceM: 150, radiusM: 150, isMock: false, speedKmh: null }),
    [],
  );
  assert.deepEqual(
    computeFlags({ distanceM: 151, radiusM: 150, isMock: false, speedKmh: null }),
    ['distance'],
  );
  // courseId null → 거리 판정 없음
  assert.deepEqual(
    computeFlags({ distanceM: null, radiusM: null, isMock: false, speedKmh: null }),
    [],
  );
  // 200km/h 초과 + mock 동시
  assert.deepEqual(
    computeFlags({ distanceM: null, radiusM: null, isMock: true, speedKmh: 201 }),
    ['speed', 'mock'],
  );
  assert.deepEqual(
    computeFlags({ distanceM: null, radiusM: null, isMock: false, speedKmh: 200 }),
    [],
  );
  // 동시각 재캡처 → Infinity → speed
  assert.deepEqual(
    computeFlags({ distanceM: null, radiusM: null, isMock: false, speedKmh: Infinity }),
    ['speed'],
  );
});

test('capturedAtError — 03 §4', () => {
  const now = new Date('2026-07-03T12:00:00Z');
  assert.equal(capturedAtError(new Date('2026-07-03T11:59:00Z'), now), null);
  assert.equal(capturedAtError(now, now), null); // captured_at ≤ submitted_at
  assert.equal(capturedAtError(new Date('2026-07-03T12:00:01Z'), now), 'future');
  assert.equal(capturedAtError(new Date('garbage'), now), 'invalid');
  // 나흘 전 캡처는 정상 (72h 만료 규칙 없음)
  assert.equal(capturedAtError(new Date('2026-06-29T12:00:00Z'), now), null);
});

test('parseBbox', () => {
  assert.deepEqual(parseBbox('126.9,37.4,127.1,37.7'), [126.9, 37.4, 127.1, 37.7]);
  assert.equal(parseBbox(undefined), null);
  assert.equal(parseBbox(''), null);
  assert.equal(parseBbox('1,2,3'), null);
  assert.equal(parseBbox('1,2,3,abc'), null);
  // 신뢰경계: 역순(min>max) 거절 — 전 코스 새어나감 방지
  assert.equal(parseBbox('127.1,37.4,126.9,37.7'), null); // minLng>maxLng
  assert.equal(parseBbox('126.9,37.7,127.1,37.4'), null); // minLat>maxLat
  assert.equal(parseBbox('126.9,37.4,126.9,37.7'), null); // 경도 0폭(degenerate)
  // 범위밖 거절
  assert.equal(parseBbox('-181,37.4,127.1,37.7'), null); // lng < -180
  assert.equal(parseBbox('126.9,37.4,127.1,91'), null); // lat > 90
  // 경계값 통과: 정확히 ±180/±90
  assert.deepEqual(parseBbox('-180,-90,180,90'), [-180, -90, 180, 90]);
});
