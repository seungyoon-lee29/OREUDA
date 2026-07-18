import { create } from 'zustand';
import { hasSession, logout, setAuthFailHandler } from './api';
import { purgeLocalData } from './outbox';

// 세션 게이트 상태 — 로그인/로그아웃 시 라우팅 가드가 구독
export const useSession = create<{
  ready: boolean;
  authed: boolean;
  init: () => Promise<void>;
  setAuthed: (v: boolean) => void;
  signOut: () => Promise<void>;
}>((set) => ({
  ready: false,
  authed: false,
  init: async () => set({ authed: await hasSession(), ready: true }),
  setAuthed: (authed) => set({ authed }),
  // 명시적 로그아웃 단일 초크포인트: 토큰 삭제 + 로컬 완등 데이터 purge(#1 오귀속 차단) + 게이트 해제.
  // refresh 실패 시 자동 logout(api.ts)은 같은 사용자 재로그인 경로라 여기 purge를 거치지 않는다(데이터 보존).
  signOut: async () => {
    await logout();
    purgeLocalData();
    set({ authed: false });
  },
}));

// refresh 실패(세션 죽음) 시 authed를 내려 게이트가 /login으로 보내게 한다(#4a).
// 명시 로그아웃과 달리 purge는 안 함 — 같은 사용자 재로그인 시 미동기 draft 보존.
setAuthFailHandler(() => useSession.setState({ authed: false }));
