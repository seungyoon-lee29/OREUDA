import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBbox } from './catalog';
import { capturedAtError, computeFlags, SKEW_MS } from './climbs';
import { UserOrIpThrottlerGuard } from './http';

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
  // 정확도 경계: 100m == 통과, 101m 초과만 flag (거절 아님 — 관대 판정)
  assert.deepEqual(
    computeFlags({ distanceM: null, radiusM: null, isMock: false, speedKmh: null, accuracyM: 100 }),
    [],
  );
  assert.deepEqual(
    computeFlags({ distanceM: null, radiusM: null, isMock: false, speedKmh: null, accuracyM: 101 }),
    ['accuracy'],
  );
  // 원거리 + 저정확도 동시 → 둘 다 flag (여전히 verified, 거절 아님)
  assert.deepEqual(
    computeFlags({ distanceM: 500, radiusM: 150, isMock: false, speedKmh: null, accuracyM: 200 }),
    ['distance', 'accuracy'],
  );
});

test('capturedAtError — 03 §4 (+M1 시계 skew 허용오차)', () => {
  const now = new Date('2026-07-03T12:00:00Z');
  assert.equal(capturedAtError(new Date('2026-07-03T11:59:00Z'), now), null);
  assert.equal(capturedAtError(now, now), null); // captured_at ≤ submitted_at
  // skew 경계: now+2분 == 통과, 1초라도 초과 = future
  assert.equal(capturedAtError(new Date(+now + SKEW_MS), now), null);
  assert.equal(capturedAtError(new Date(+now + SKEW_MS + 1000), now), 'future');
  assert.equal(capturedAtError(new Date('garbage'), now), 'invalid');
  // 나흘 전 캡처는 정상 (72h 만료 규칙 없음)
  assert.equal(capturedAtError(new Date('2026-06-29T12:00:00Z'), now), null);
});

test('UserOrIpThrottlerGuard.getTracker — H1b: 유효 토큰=userId, 그 외=IP', async () => {
  // DI 없이 프로토타입만 — getTracker 분기 검증 (글로벌 가드라 req.userId 미존재 시점, 토큰 직접 검증)
  const guard: any = Object.create(UserOrIpThrottlerGuard.prototype);
  guard.jwtSvc = {
    verify(t: string) {
      if (t !== 'good') throw new Error('invalid');
      return { sub: 'user-1' };
    },
  };
  assert.equal(
    await guard.getTracker({ headers: { authorization: 'Bearer good' }, ip: '1.2.3.4' }),
    'user:user-1',
  );
  // 무효 토큰·비인증(로그인/가입) → IP 폴백
  assert.equal(
    await guard.getTracker({ headers: { authorization: 'Bearer bad' }, ip: '1.2.3.4' }),
    '1.2.3.4',
  );
  assert.equal(await guard.getTracker({ headers: {}, ip: '1.2.3.4' }), '1.2.3.4');
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
