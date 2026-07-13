// tiers.ts 등급 경계 검증 — node --test src/lib/tiers.test.js
// ponytail: TS 컴파일러 없이 node --test 실행 — 로직을 여기 미러링. 실제 소스: tiers.ts (TIERS/tierFor/nextTier/hasAllClear)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const TIERS = [
  { min: 0, name: '새내기' },
  { min: 3, name: '등산 입문' },
  { min: 10, name: '산꾼' },
  { min: 25, name: '산악인' },
  { min: 50, name: '완등왕' },
];
const SUMMIT_GOAL = TIERS[TIERS.length - 1].min;
const tierFor = (done) => { let t = TIERS[0]; for (const x of TIERS) if (done >= x.min) t = x; return t; };
const nextTier = (done) => TIERS.find((t) => t.min > done) ?? null;
const hasAllClear = (done) => done >= SUMMIT_GOAL;

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
