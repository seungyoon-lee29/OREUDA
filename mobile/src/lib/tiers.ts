// 완등 코스 수 → 등급. 전부 클라이언트 파생(useVerifiedSet().size). 백엔드 무관.
// 색은 design system 토큰 값을 직접 박음(theme.ts import 대신 리터럴 — 등급 스킴은 여기가 SSOT).
export const TOTAL_COURSES = 8; // ponytail: v0 프로덕션 코스 수 상수. v1엔 /courses 카탈로그 카운트로.

export type Tier = { min: number; name: string; color: string; ring?: boolean };

export const TIERS: Tier[] = [
  { min: 0, name: '새내기', color: '#9BA1A6' }, // C.faint
  { min: 1, name: '등산 입문', color: '#4E9E6B' }, // muted green
  { min: 3, name: '산꾼', color: '#2ECC71' }, // C.success
  { min: 5, name: '산악인', color: '#2ECC71', ring: true }, // green + ring
  { min: 8, name: '완등왕', color: '#F5C542' }, // gold — 성공 모먼트 예외 + 배지
];

// 완등 수에 맞는 가장 높은 등급.
export function tierFor(done: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (done >= tier.min) t = tier;
  return t;
}

// 다음 등급(min > done 중 첫 번째). 최고 등급이면 null.
export function nextTier(done: number): Tier | null {
  return TIERS.find((t) => t.min > done) ?? null;
}

// 전 코스 완등 배지 — 완등왕과 동일하지만 배지 섹션 SSOT.
export const ALL_CLEAR_BADGE = { name: '완등왕', color: '#F5C542', need: TOTAL_COURSES };
export function hasAllClear(done: number): boolean {
  return done >= TOTAL_COURSES;
}

// ── 경계 자체검증 (import 시 실행 안 됨). 실행: node --experimental-strip-types src/lib/tiers.ts
// ponytail: 프레임워크·@types/node 없이 eq 한 줄 — testing.md 관례. RN 번들엔 import.meta.main 없어 스킵.
declare global {
  interface ImportMeta { main?: boolean }
}
if (import.meta.main) {
  const eq = (got: unknown, want: unknown, msg: string) => {
    if (got !== want) throw new Error(`${msg}: ${String(got)} !== ${String(want)}`);
  };
  eq(tierFor(0).name, '새내기', 'tierFor(0)');
  eq(tierFor(2).name, '등산 입문', 'tierFor(2)');
  eq(tierFor(3).name, '산꾼', 'tierFor(3)');
  eq(tierFor(5).name, '산악인', 'tierFor(5)');
  eq(tierFor(8).name, '완등왕', 'tierFor(8)');
  eq(nextTier(0)?.name, '등산 입문', 'nextTier(0)');
  eq(nextTier(8), null, 'nextTier(8)');
  eq(hasAllClear(7), false, 'hasAllClear(7)');
  eq(hasAllClear(8), true, 'hasAllClear(8)');
  console.log('tiers self-check OK');
}
