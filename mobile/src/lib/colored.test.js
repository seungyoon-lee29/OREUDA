// colored.ts의 dimColor 알파 치환 로직 최소 검증 — node --test src/lib/colored.test.js
// ponytail: TS 컴파일러 없이 node --test 실행 — 실제 소스: colored.ts dimColor 함수
import { test } from 'node:test';
import assert from 'node:assert/strict';

const dimColor = (c) => c.length === 9 ? c.slice(0, 7) + '55' : c + '55';

test('dimColor 6자리 hex에 알파 55 append', () => {
  assert.equal(dimColor('#00C08B'), '#00C08B55');
  assert.equal(dimColor('#4D9FDE'), '#4D9FDE55');
  assert.equal(dimColor('#FF8133'), '#FF813355');
});
test('dimColor 8자리 hex 알파 자리만 55로 교체', () => {
  assert.equal(dimColor('#F8F9FA66'), '#F8F9FA55'); // UNCLIMBED_COLOR 기준
  assert.equal(dimColor('#F8F9FA99'), '#F8F9FA55');
});
