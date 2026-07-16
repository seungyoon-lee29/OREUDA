// mountainSets.ts 파생 로직 경계 검증 — node --test src/lib/mountainSets.test.js
// ponytail: TS 컴파일러 없이 node --test 실행 — 로직을 여기 미러링. 실제 소스: mountainSets.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SETS = [
  { name: '서울 5대 명산', mountains: ['북한산', '도봉산', '관악산', '수락산', '불암산'] },
  { name: '도심 4산', mountains: ['북악산', '인왕산', '남산', '안산'] },
  { name: '강남·동남 6산', mountains: ['관악산', '청계산', '우면산', '구룡산', '대모산', '일자산'] },
  { name: '동부 능선', mountains: ['용마산', '아차산'] },
  { name: '서부 3산', mountains: ['백련산', '봉산', '개화산'] },
];

function verifiedByMountain(climbs) {
  const map = new Map();
  for (const c of climbs) {
    if (c.status !== 'verified' || !c.courseId || !c.mountain) continue;
    const s = map.get(c.mountain.name) ?? new Set();
    s.add(c.courseId);
    map.set(c.mountain.name, s);
  }
  return map;
}

function conqueredMountains(catalog, byMountain) {
  const out = new Set();
  for (const m of catalog) {
    if (m.courseCount > 0 && (byMountain.get(m.name)?.size ?? 0) >= m.courseCount) out.add(m.name);
  }
  return out;
}

function setProgress(set, conquered) {
  return { done: set.mountains.filter((m) => conquered.has(m)).length, total: set.mountains.length };
}

function newlyAchieved(catalog, byMountain, added) {
  const before = conqueredMountains(catalog, byMountain);
  const after = new Map(byMountain);
  after.set(added.mountainName, new Set(after.get(added.mountainName) ?? []).add(added.courseId));
  const afterConquered = conqueredMountains(catalog, after);
  const isComplete = (s, c) => setProgress(s, c).done === s.mountains.length;
  return {
    mountain:
      afterConquered.has(added.mountainName) && !before.has(added.mountainName) ? added.mountainName : null,
    sets: SETS.filter((s) => isComplete(s, afterConquered) && !isComplete(s, before)).map((s) => s.name),
  };
}

// ---- 픽스처: 용마산(코스 2) + 아차산(코스 1) = '동부 능선' 세트 ----
const CATALOG = [
  { name: '용마산', courseCount: 2 },
  { name: '아차산', courseCount: 1 },
  { name: '남산', courseCount: 1 },
];
const climb = (mountain, courseId, status = 'verified') => ({ status, courseId, mountain: { name: mountain } });

test('SETS — 세트 내 중복 없음, 전체 19산 커버(관악산 겹침 1)', () => {
  const all = SETS.flatMap((s) => s.mountains);
  for (const s of SETS) assert.equal(new Set(s.mountains).size, s.mountains.length, s.name);
  assert.equal(all.length, 20); // 5+4+6+2+3
  assert.equal(new Set(all).size, 19); // 관악산이 2세트에 겹침
});

test('verifiedByMountain — verified만, courseId/mountain null 제외, 재완등 dedupe', () => {
  const by = verifiedByMountain([
    climb('용마산', 'c1'),
    climb('용마산', 'c1'), // 같은 코스 재완등(다른 날)
    climb('용마산', 'c2', 'rejected'),
    { status: 'verified', courseId: null, mountain: { name: '용마산' } },
    { status: 'verified', courseId: 'cx', mountain: null },
  ]);
  assert.equal(by.get('용마산').size, 1);
  assert.equal(by.size, 1);
});

test('산 완등 경계 — 2코스 중 1완등=미완등, 2/2=완등', () => {
  assert.equal(conqueredMountains(CATALOG, verifiedByMountain([climb('용마산', 'c1')])).has('용마산'), false);
  assert.equal(
    conqueredMountains(CATALOG, verifiedByMountain([climb('용마산', 'c1'), climb('용마산', 'c2')])).has('용마산'),
    true,
  );
});

test('courseCount 0인 산은 자명 완등 아님', () => {
  assert.equal(conqueredMountains([{ name: '무코스산', courseCount: 0 }], new Map()).has('무코스산'), false);
});

test('setProgress — 부분/완성', () => {
  const east = SETS.find((s) => s.name === '동부 능선');
  assert.deepEqual(setProgress(east, new Set(['용마산'])), { done: 1, total: 2 });
  assert.deepEqual(setProgress(east, new Set(['용마산', '아차산'])), { done: 2, total: 2 });
});

test('newlyAchieved — 산 미완성이면 아무것도 없음', () => {
  const r = newlyAchieved(CATALOG, verifiedByMountain([]), { mountainName: '용마산', courseId: 'c1' });
  assert.deepEqual(r, { mountain: null, sets: [] });
});

test('newlyAchieved — 산만 완등(세트는 아직)', () => {
  const by = verifiedByMountain([climb('용마산', 'c1')]);
  const r = newlyAchieved(CATALOG, by, { mountainName: '용마산', courseId: 'c2' });
  assert.equal(r.mountain, '용마산');
  assert.deepEqual(r.sets, []);
});

test('newlyAchieved — 산 + 세트 동시 완성', () => {
  // 용마산 이미 완등, 아차산 유일 코스 완등 → 아차산 완등 + '동부 능선' 완성
  const by = verifiedByMountain([climb('용마산', 'c1'), climb('용마산', 'c2')]);
  const r = newlyAchieved(CATALOG, by, { mountainName: '아차산', courseId: 'a1' });
  assert.equal(r.mountain, '아차산');
  assert.deepEqual(r.sets, ['동부 능선']);
});

test('newlyAchieved — 이미 verified인 코스 재완등이면 아무것도 없음', () => {
  const by = verifiedByMountain([climb('용마산', 'c1'), climb('용마산', 'c2')]);
  const r = newlyAchieved(CATALOG, by, { mountainName: '용마산', courseId: 'c2' });
  assert.deepEqual(r, { mountain: null, sets: [] });
});
