// 정복 세트 — 도메인 개념명. 사용자 노출 문구는 '완등 세트'/'완등'만(CONTEXT.md: UI에 '정복' 금지).
// 산 완등 = 그 산의 전 코스 완등. 전부 클라이언트 파생 — 백엔드 무변경:
//   /mountains 의 courseCount × me/climbs 의 verified 코스 귀속(mountain.name)으로 판정한다.
// ponytail: 코스 id 전수 대조 대신 distinct verified 코스 수 ≥ courseCount — 코스는 정확히 한 산에
// 종속(서버 join 파생)이라 동치이고, 전 코스 path 다운로드(/courses 전체) 없이 기존 쿼리만 쓴다.
// 세트는 산 '이름' 문자열 매칭 — seed 카탈로그(19산)와 정확 일치해야 한다(이름은 카탈로그에서 유일).

export type MountainSet = { name: string; mountains: string[] };

// 큐레이션 세트 5개 SSOT — 카탈로그 19산 전부 커버, 겹침 허용(관악산 2세트).
export const SETS: MountainSet[] = [
  { name: '서울 5대 명산', mountains: ['북한산', '도봉산', '관악산', '수락산', '불암산'] },
  { name: '도심 4산', mountains: ['북악산', '인왕산', '남산', '안산'] },
  { name: '강남·동남 6산', mountains: ['관악산', '청계산', '우면산', '구룡산', '대모산', '일자산'] },
  { name: '동부 능선', mountains: ['용마산', '아차산'] },
  { name: '서부 3산', mountains: ['백련산', '봉산', '개화산'] },
];

// me/climbs 행 중 파생에 필요한 최소 필드 (MeClimbsSchema 부분집합 — 구조적 호환)
type ClimbRow = { status: string; courseId: string | null; mountain: { name: string } | null };
type MountainStat = { name: string; courseCount: number };

// me/climbs → 산 이름별 verified 코스 id 집합. Set이라 같은 코스 재완등(다른 날)은 자동 dedupe.
export function verifiedByMountain(climbs: ClimbRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const c of climbs) {
    if (c.status !== 'verified' || !c.courseId || !c.mountain) continue;
    const s = map.get(c.mountain.name) ?? new Set<string>();
    s.add(c.courseId);
    map.set(c.mountain.name, s);
  }
  return map;
}

// 완등한 산(전 코스 완등) 이름 집합. courseCount 0인 산은 자명 완등 방지로 제외.
export function conqueredMountains(
  catalog: MountainStat[],
  byMountain: Map<string, Set<string>>,
): Set<string> {
  const out = new Set<string>();
  for (const m of catalog) {
    if (m.courseCount > 0 && (byMountain.get(m.name)?.size ?? 0) >= m.courseCount) out.add(m.name);
  }
  return out;
}

// 세트 진행: 완등한 산 수 / 세트 산 수. done === total 이면 세트 완성.
export function setProgress(set: MountainSet, conquered: Set<string>): { done: number; total: number } {
  return { done: set.mountains.filter((m) => conquered.has(m)).length, total: set.mountains.length };
}

// 인증 직전/직후 비교 — 이번 완등(courseId)으로 '새로' 달성한 산·세트 (capture 축하 배너용).
// 이미 verified인 코스 재완등이면 직후=직전이라 아무것도 반환 안 됨(재완등에 배너 없음, 의도).
export function newlyAchieved(
  catalog: MountainStat[],
  byMountain: Map<string, Set<string>>,
  added: { mountainName: string; courseId: string },
): { mountain: string | null; sets: string[] } {
  const before = conqueredMountains(catalog, byMountain);
  // new Map은 shallow copy(값 Set은 원본 공유) — inner Set을 반드시 new Set으로 복사해 원본 뮤테이션 방지.
  // before를 after 조작 전에 계산하는 순서도 계약의 일부다(리뷰 MEDIUM 명시화).
  const after = new Map(byMountain);
  after.set(added.mountainName, new Set(after.get(added.mountainName) ?? []).add(added.courseId));
  const afterConquered = conqueredMountains(catalog, after);
  const isComplete = (s: MountainSet, c: Set<string>) => setProgress(s, c).done === s.mountains.length;
  return {
    mountain:
      afterConquered.has(added.mountainName) && !before.has(added.mountainName) ? added.mountainName : null,
    sets: SETS.filter((s) => isComplete(s, afterConquered) && !isComplete(s, before)).map((s) => s.name),
  };
}
