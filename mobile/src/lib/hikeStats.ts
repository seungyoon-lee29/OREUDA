// 운동 요약 — 완등 성공 시점의 로컬 계산. 서버/DB·트랙 기록 없음(트랙로그는 v2, 01 §9).
// 거리=코스 실측 길이(distanceM), 경사도=GPS 시작·정상 고도 델타(둘 다 있을 때만),
// 칼로리=MET 추정. 측정 불가한 값은 null로 두고 UI가 우아하게 처리한다(가짜 숫자 금지).
export type HikeSummary = {
  durationMin: number;
  distanceM: number | null;
  avgSpeedKmh: number | null;
  ascentM: number | null;
  gradientPct: number | null;
  calories: number;
};

// ponytail: 체중 입력 UI가 프로필에 생기면 prefs로 승격. 없으면 표준 성인 근사값으로 추정.
export const ASSUMED_WEIGHT_KG = 65;

// 스테일 세션 가드 — 종료를 잊은 세션이 이틀 뒤 인증되면 '49시간·2만kcal' 허수가 나온다(가짜 숫자 금지).
// 당일치기 최장 산행도 16h면 충분, 초과는 세션이 스테일하다고 보고 요약 스킵.
export const MAX_HIKE_MS = 16 * 3_600_000;

// MET 추정 — 2011 Compendium 보행값 근사 + 경사 가산. 산이라 경사 미상이면 완만한 오르막 가정.
export function hikingMet(speedKmh: number | null, gradientPct: number | null): number {
  const s = speedKmh ?? 4; // 속도 미상 → 완만한 등산 속도 가정
  const base = s < 3.2 ? 2.8 : s < 4.8 ? 3.5 : s < 5.6 ? 4.3 : s < 6.4 ? 5.0 : 6.0;
  // 경사 미상이면 산행 기본 오르막(+1.5), 있으면 %당 0.15 가산(30% 상한).
  const gradeBump = gradientPct == null ? 1.5 : Math.min(gradientPct, 30) * 0.15;
  return base + gradeBump;
}

export function computeHikeSummary(input: {
  startedAt: string;
  endedAtMs: number;
  distanceM: number | null;
  startAltitude: number | null;
  endAltitude: number | null;
  weightKg?: number;
}): HikeSummary | null {
  const durationMs = input.endedAtMs - Date.parse(input.startedAt);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null; // 실경과시간 없으면 요약 없음
  if (durationMs > MAX_HIKE_MS) return null; // 스테일 세션 — 허수 요약 방지
  const durationMin = Math.round(durationMs / 60_000);
  const hours = durationMs / 3_600_000;

  const distanceM = input.distanceM;
  // 사람 보행 상한(오르막 평균)을 넘으면 = 측정하기엔 너무 짧은 등반 → 속도 미표시.
  const rawSpeed = distanceM != null && distanceM > 0 ? distanceM / 1000 / hours : null;
  const avgSpeedKmh = rawSpeed != null && rawSpeed <= 12 ? Math.round(rawSpeed * 10) / 10 : null;

  const ascentM =
    input.startAltitude != null && input.endAltitude != null
      ? Math.max(0, Math.round(input.endAltitude - input.startAltitude)) // 하강/노이즈는 0으로 클램프
      : null;
  // 경사도 = 상승/수평거리. distanceM은 경로 길이라 수평거리보다 약간 길어 경사가 살짝 보수적(ponytail).
  const gradientPct =
    ascentM != null && distanceM != null && distanceM > 0
      ? Math.round((ascentM / distanceM) * 100 * 10) / 10
      : null;

  const met = hikingMet(avgSpeedKmh, gradientPct);
  const calories = Math.round(met * (input.weightKg ?? ASSUMED_WEIGHT_KG) * hours);

  return { durationMin, distanceM, avgSpeedKmh, ascentM, gradientPct, calories };
}
