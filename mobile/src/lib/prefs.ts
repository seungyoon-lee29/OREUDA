import { createMMKV } from 'react-native-mmkv';

// 동기 로컬 프리퍼런스 — 온보딩 1회 노출 플래그. MMKV 인스턴스 1개만.
// mmkv v4(Nitro)는 new MMKV() 대신 createMMKV() 팩토리.
const store = createMMKV();
const K = 'onboarding_seen_v1';

export const hasSeenOnboarding = () => store.getBoolean(K) ?? false;
export const markOnboardingSeen = () => store.set(K, true);

// 마지막 로그인 계정 — 같은 계정 재로그인 시 미전송 draft 보존 판단용(outbox.reconcileLocalDataForAccount).
// ponytail: 로컬 기기 한정 비교라 이메일 lowercase로 충분(해시 불필요).
const LAST_ACCOUNT = 'last_account_v1';
export const lastAccount = () => store.getString(LAST_ACCOUNT);
export const setLastAccount = (email: string) => store.set(LAST_ACCOUNT, email);
