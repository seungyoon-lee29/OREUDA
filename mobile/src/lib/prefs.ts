import { createMMKV } from 'react-native-mmkv';

// 동기 로컬 프리퍼런스 — 온보딩 1회 노출 플래그. MMKV 인스턴스 1개만.
// mmkv v4(Nitro)는 new MMKV() 대신 createMMKV() 팩토리.
const store = createMMKV();
const K = 'onboarding_seen_v1';
const GUEST_K = 'is_guest_v1';

export const hasSeenOnboarding = () => store.getBoolean(K) ?? false;
export const markOnboardingSeen = () => store.set(K, true);

// 게스트 플래그 — 게스트로 시작 시 true, 실제 로그인/로그아웃 시 false.
export const isGuest = () => store.getBoolean(GUEST_K) ?? false;
export const setGuest = (v: boolean) => store.set(GUEST_K, v);
