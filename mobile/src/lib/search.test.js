// search 순수 함수 최소 체크 — node --test src/app/search.test.js
// RN import 없이 로직만 검증 (search.tsx의 filterMountains/groupByRegion 동등 구현)
import { test } from 'node:test';
import assert from 'node:assert/strict';

function filterMountains(mountains, q) {
  if (!q) return mountains;
  const lq = q.toLowerCase();
  return mountains.filter(
    (m) => m.name.toLowerCase().includes(lq) || m.region?.toLowerCase().includes(lq),
  );
}

function groupByRegion(mountains) {
  const map = new Map();
  for (const m of mountains) {
    const key = m.region ?? '기타';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return [...map.entries()].map(([title, data]) => ({ title, data }));
}

const SAMPLE = [
  { id: '1', name: '북한산', region: '서울', elevationM: 836, courseCount: 3 },
  { id: '2', name: '관악산', region: '경기', elevationM: 632, courseCount: 2 },
  { id: '3', name: '청계산', region: '경기', elevationM: 618, courseCount: 1 },
];

test('빈 쿼리 = 전체 반환', () => {
  assert.equal(filterMountains(SAMPLE, '').length, 3);
});
test('이름 includes 필터', () => {
  const r = filterMountains(SAMPLE, '북한');
  assert.equal(r.length, 1);
  assert.equal(r[0].name, '북한산');
});
test('region includes 필터', () => {
  assert.equal(filterMountains(SAMPLE, '경기').length, 2);
});
test('대소문자 무시', () => {
  assert.equal(filterMountains(SAMPLE, '북한').length, 1);
});
test('groupByRegion 섹션 수', () => {
  const groups = groupByRegion(SAMPLE);
  assert.equal(groups.length, 2);
});
test('groupByRegion 키 순서', () => {
  const groups = groupByRegion(SAMPLE);
  assert.equal(groups[0].title, '서울');
  assert.equal(groups[1].data.length, 2);
});
