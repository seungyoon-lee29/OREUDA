import { create } from 'zustand';
import { hasSession } from './api';

// 세션 게이트 상태 — 로그인/로그아웃 시 라우팅 가드가 구독
export const useSession = create<{
  ready: boolean;
  authed: boolean;
  init: () => Promise<void>;
  setAuthed: (v: boolean) => void;
}>((set) => ({
  ready: false,
  authed: false,
  init: async () => set({ authed: await hasSession(), ready: true }),
  setAuthed: (authed) => set({ authed }),
}));
