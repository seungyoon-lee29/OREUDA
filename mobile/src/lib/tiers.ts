// 완등 코스 수 → 등급. 전부 클라이언트 파생(useVerifiedSet().size). 백엔드 무관.
// 마일스톤 기반: 실제 카탈로그(~50+)와 무관하게 절대 완등 개수로 등급을 매긴다.
// (v0는 8코스 기준이었으나 seed_seoul로 카탈로그가 커져 '전 코스=N/총' 방식이 깨짐 → 마일스톤 전환)
// 색은 design 토큰 값을 직접 박음(theme.ts import 대신 리터럴 — 등급 스킴은 여기가 SSOT).
export type Tier = { min: number; name: string; color: string; ring?: boolean };

export const TIERS: Tier[] = [
  { min: 0, name: '새내기', color: '#9BA1A6' }, // C.faint
  { min: 3, name: '등산 입문', color: '#4E9E6B' }, // muted green
  { min: 10, name: '산꾼', color: '#2ECC71' }, // C.success
  { min: 25, name: '산악인', color: '#2ECC71', ring: true }, // green + ring
  { min: 50, name: '완등왕', color: '#F5C542' }, // gold — 성공 모먼트 예외 + 배지
];

// 완등왕 목표 = 최고 마일스톤 min. 배지 need·진행바 분모의 SSOT (별도 상수 드리프트 방지).
export const SUMMIT_GOAL = TIERS[TIERS.length - 1].min;

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

// 완등왕 배지 — 완등왕 등급과 동일 임계지만 배지 섹션 SSOT.
export const ALL_CLEAR_BADGE = { name: '완등왕', color: '#F5C542', need: SUMMIT_GOAL };
export function hasAllClear(done: number): boolean {
  return done >= SUMMIT_GOAL;
}
