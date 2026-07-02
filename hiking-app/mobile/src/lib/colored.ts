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

export const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '#4CAF50',
  moderate: '#FF9800',
  hard: '#F44336',
};
export const UNCLIMBED_COLOR = '#9E9E9E66';
