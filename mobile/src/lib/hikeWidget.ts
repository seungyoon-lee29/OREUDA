// 등반 위젯 표시 상태 — 경로 투영 결과 + 경과시간 → 잠금화면/알림에 뿌릴 문자열.
// 순수 함수(표시 전용). 인증·판정과 무관(03 불변). expo-widgets/expo-location 배선은 hikeTracker.ts.
import { type CourseProgress, OFF_COURSE_LIMIT_M } from './courseProgress.ts';

const KST_OFFSET_MS = 9 * 3_600_000;
const MAX_ETA_MS = 16 * 3_600_000; // 이보다 먼 ETA는 페이스가 비현실적 → 미표시(가짜 숫자 금지, hikeStats와 동일 상한)
const MIN_PROGRESS_FOR_ETA_M = 50; // 이보다 덜 왔으면 평균페이스가 노이즈라 ETA 미표시
const DEFAULT_ARRIVE_M = 30; // 잔여거리 이 이내면 '정상 도착' 표시로 전환

export type HikeWidgetState = {
  elapsedMin: number;
  elapsedLabel: string; // "1시간 23분" | "23분"
  doneKm: string; // "1.2"
  remainingKm: string; // "0.8"
  progressPct: number; // 0..100 정수
  etaLabel: string | null; // "14:30" (KST) — 도착·데이터부족·비현실 페이스면 null
  altitudeLabel: string | null; // "512m" — 고도 미상이면 null
  arrived: boolean; // true → "정상 도착 — 앱에서 인증하세요"로 전환
};

function elapsedLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function kstClock(ms: number): string {
  const d = new Date(ms + KST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatHikeWidget(input: {
  startedAtMs: number;
  nowMs: number;
  progress: CourseProgress;
  altitude: number | null;
  arriveRadiusM?: number;
}): HikeWidgetState {
  const { progress } = input;
  const elapsedMs = Math.max(0, input.nowMs - input.startedAtMs);
  const elapsedMin = Math.floor(elapsedMs / 60_000);
  const arriveRadiusM = input.arriveRadiusM ?? DEFAULT_ARRIVE_M;

  // 코스에서 크게 벗어나면(집에서 시작·GPS 튐) projectOnCourse가 엉뚱한 세그먼트에 스냅해 가짜 진행률·거리가 나온다
  // (실기기: 남산 밖인데 96%·1.4km, 심하면 가짜 '도착'까지). 지도 배너와 동일 가드 — 이탈이면 '코스 진입 전'으로 취급.
  const offCourse = progress.offCourseM > OFF_COURSE_LIMIT_M;
  const progressM = offCourse ? 0 : progress.progressM;
  const remainingM = offCourse ? progress.totalM : progress.remainingM;
  const fraction = offCourse ? 0 : progress.fraction;
  const arrived = !offCourse && (remainingM <= arriveRadiusM || fraction >= 0.999);

  // ETA = 평균 페이스(경과/진행) 외삽. ponytail: 단순 평균페이스 — 오르막이 뒤로 갈수록 느려져 초반엔 낙관적.
  // 등고도-경사 반영 모델은 트랙로그(v2) 붙으면 승격.
  let etaLabel: string | null = null;
  if (!arrived && progressM >= MIN_PROGRESS_FOR_ETA_M && elapsedMs > 0) {
    const remainingMs = elapsedMs * (remainingM / progressM);
    if (remainingMs <= MAX_ETA_MS) etaLabel = kstClock(input.nowMs + remainingMs);
  }

  return {
    elapsedMin,
    elapsedLabel: elapsedLabel(elapsedMin),
    doneKm: (progressM / 1000).toFixed(1),
    remainingKm: (remainingM / 1000).toFixed(1),
    progressPct: Math.max(0, Math.min(100, Math.round(fraction * 100))),
    etaLabel,
    altitudeLabel: input.altitude != null ? `${Math.round(input.altitude)}m` : null,
    arrived,
  };
}
