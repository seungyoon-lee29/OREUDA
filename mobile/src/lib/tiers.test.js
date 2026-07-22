// tiers.ts 등급 경계 검증 — node --test src/lib/tiers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUMMIT_GOAL, tierFor, nextTier, hasAllClear } from './tiers.ts';

test('tierFor 경계 — 각 마일스톤 직전/직후', () => {
  assert.equal(tierFor(0).name, '새내기');
  assert.equal(tierFor(2).name, '새내기');
  assert.equal(tierFor(3).name, '등산 입문');
  assert.equal(tierFor(9).name, '등산 입문');
  assert.equal(tierFor(10).name, '산꾼');
  assert.equal(tierFor(24).name, '산꾼');
  assert.equal(tierFor(25).name, '산악인');
  assert.equal(tierFor(49).name, '산악인');
  assert.equal(tierFor(50).name, '완등왕');
  assert.equal(tierFor(999).name, '완등왕');
});

test('nextTier — 최고 등급이면 null', () => {
  assert.equal(nextTier(0)?.name, '등산 입문');
  assert.equal(nextTier(24)?.name, '산악인');
  assert.equal(nextTier(49)?.name, '완등왕');
  assert.equal(nextTier(50), null);
});

test('hasAllClear — SUMMIT_GOAL(50) 경계', () => {
  assert.equal(SUMMIT_GOAL, 50);
  assert.equal(hasAllClear(49), false);
  assert.equal(hasAllClear(50), true);
});
