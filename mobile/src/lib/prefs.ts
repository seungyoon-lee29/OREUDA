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

// 등반 위젯: iOS '항상 허용' 업그레이드 안내를 1회만 노출(매 등반 나그하지 않게). 사용자가 선택권을 갖게 하는 규칙(2026-07-19).
const ALWAYS_PROMPT = 'always_location_prompt_v1';
export const hasSeenAlwaysPrompt = () => store.getBoolean(ALWAYS_PROMPT) ?? false;
export const markAlwaysPromptSeen = () => store.set(ALWAYS_PROMPT, true);
