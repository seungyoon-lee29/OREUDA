import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { MeClimbsSchema } from './schemas';
import { pendingCourseIds, subscribeOutbox } from './outbox';
import { useSession } from './stores';

// 색칠 SSOT (04 §1): pending = outbox 파생, verified = me/climbs 캐시 파생. 렌더는 O(1) 룩업.
export function usePendingSet(): Set<string> {
  const [set, setSet] = useState<Set<string>>(() => pendingCourseIds());
  useEffect(() => subscribeOutbox(() => setSet(pendingCourseIds())), []);
  return set;
}

export function useMeClimbs() {
  const authed = useSession((s) => s.authed);
  return useQuery({
    queryKey: ['me-climbs'],
    queryFn: async () => MeClimbsSchema.parse(await api('/me/climbs')),
    enabled: authed,
  });
}

export function useVerifiedSet(): Set<string> {
  const { data } = useMeClimbs();
  const set = new Set<string>();
  for (const c of data?.climbs ?? []) {
    if (c.status === 'verified' && c.courseId) set.add(c.courseId);
  }
  return set;
}

// 05-design §3.1: 색약 안전 Okabe-Ito 팔레트 (Material 적록 조합은 한국 남성 5~6% 색각이상에 위험)
export const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '#009E73', // bluish green
  moderate: '#0072B2', // blue
  hard: '#D55E00', // vermillion
};
// 색 단독 인코딩 금지 (05 §3.1) — 색과 항상 병기할 텍스트 라벨
export const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '쉬움',
  moderate: '보통',
  hard: '어려움',
};
export const UNCLIMBED_COLOR = '#8A8A8ACC'; // 05 §9 도화지: 저불투명이되 톤다운 지도·basemap 트레일 위에서 읽히게 (66→CC)

// 04 §7 / 05 §3.1: 코스 선 3상태를 색 단독이 아니라 색+굵기+패턴으로 이중 인코딩(색약 안전).
export type LineState = 'unclimbed' | 'pending' | 'verified';
export function lineStyle(
  state: LineState,
  difficulty: string | null | undefined,
): { color: string; width: number; pattern?: number[] } {
  const color = DIFFICULTY_COLOR[difficulty ?? 'moderate'];
  if (state === 'verified') return { color, width: 6 }; // 실선·굵게 = 완등
  if (state === 'pending') return { color, width: 4, pattern: [12, 8] }; // 점선 = 제출 대기(진행 중)
  return { color: UNCLIMBED_COLOR, width: 3 }; // 회색 = 미완등(도화지: 보이되 verified 실선 w6보다 약하게)
}
