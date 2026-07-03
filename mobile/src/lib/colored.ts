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
export const UNCLIMBED_COLOR = '#9E9E9E66';
