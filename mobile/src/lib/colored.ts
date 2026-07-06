import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { MeClimbsSchema } from './schemas';
import { pendingCourseIds, subscribeOutbox } from './outbox';
import { useSession } from './stores';
import { C } from './theme';

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

// 05 §3.1 Okabe-Ito 유지 — 다크 배경 AA를 위해 밝기만 리프트(hue 동일: 164°/203°/26°)
// easy: #009E73 (5.00) → #00C08B (7.25), moderate: #0072B2 (3.30) → #4D9FDE (5.96), hard: #D55E00 (4.42) → #FF8133 (6.87)
export const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '#00C08B',
  moderate: '#4D9FDE',
  hard: '#FF8133',
};

// 색 단독 인코딩 금지 (05 §3.1) — 색과 항상 병기할 텍스트 라벨
export const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '쉬움',
  moderate: '보통',
  hard: '어려움',
};

// 도화지: 다크 지도 위 Cloud White 40% — 레퍼런스 "pending=흰 점선"의 톤을 미완등 캔버스로 차용
export const UNCLIMBED_COLOR = '#F8F9FA66';

// 05 §9 저줌 산 마커 SSOT: 색(symbol green/gray)+아이콘(✓)+텍스트 삼중 인코딩(색약 안전, 색 단독 금지).
// 다크 지도 전환: haloColor 흰색→다크 granite #0C0E10 (다크 basemap 위에서 흰 halo는 들뜸)
export function mountainMarkerStyle(conquered: boolean) {
  return conquered
    ? { symbol: 'green' as const, caption: { text: '완등 ✓', color: C.success, haloColor: '#0C0E10', textSize: 13 } }
    : { symbol: 'gray' as const, caption: { text: '미완등', color: C.body, haloColor: '#0C0E10', textSize: 13 } };
}

// 04 §7 / 05 §3.1: 코스 선 3상태를 색 단독이 아니라 색+굵기+패턴으로 이중 인코딩(색약 안전).
export type LineState = 'unclimbed' | 'pending' | 'verified';
// P0-1: 네비식 코스 선택 강조 — selected=선택/dimmed=미선택 페이드
export type Emphasis = 'none' | 'selected' | 'dimmed';

// ponytail: 8자리 hex(#RRGGBBAA)는 알파 자리(마지막 2자리)만 '55'로 교체, 6자리는 append.
// colored.test.js 로 검증 — 경계: '#F8F9FA66' → '#F8F9FA55', '#00C08B' → '#00C08B55'
const dimColor = (c: string): string =>
  c.length === 9 ? c.slice(0, 7) + '55' : c + '55';

export function lineStyle(
  state: LineState,
  difficulty: string | null | undefined,
  emphasis: Emphasis = 'none',
): { color: string; width: number; pattern?: number[]; glow?: { color: string; width: number } } {
  const baseColor = DIFFICULTY_COLOR[difficulty ?? 'moderate'];
  let color: string;
  let width: number;
  let pattern: number[] | undefined;
  let glow: { color: string; width: number } | undefined;

  if (state === 'verified') {
    color = baseColor;
    width = 6;
    glow = { color: baseColor + '4D', width: 14 }; // 30% 알파 글로 언더레이 (§2)
  } else if (state === 'pending') {
    color = baseColor;
    width = 4;
    pattern = [12, 8]; // 점선 = 제출 대기
  } else {
    color = UNCLIMBED_COLOR;
    width = 3; // 흰 40% = 미완등 도화지
  }

  if (emphasis === 'selected') {
    width += 2; // 선택 코스 굵기 강조
  } else if (emphasis === 'dimmed') {
    color = dimColor(color); // 알파 33% — 타 코스 페이드
    glow = undefined; // dimmed 코스엔 glow 불필요
  }

  return { color, width, ...(pattern ? { pattern } : {}), ...(glow ? { glow } : {}) };
}
