import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://hiking-api-v0.fly.dev';

// access는 메모리, refresh는 SecureStore (04 §2 — 고정 refresh, rotation은 v1)
let accessToken: string | null = null;
const REFRESH_KEY = 'refresh_token';

// 세션 세대 — login/signup(setSession)·logout 마다 증가. in-flight 요청이 세션 경계를
// 넘어 401 재시도로 다른 계정 토큰을 집는 오귀속 레이스를 막는 데 쓴다(아래 api()).
let sessionGen = 0;
export const currentSessionGen = () => sessionGen;

export class AuthRequiredError extends Error {}

// 세션이 죽었을 때(refresh 없음/거부) UI 상태를 내리도록 store가 등록하는 콜백.
// api→stores 직접 import는 순환이라 콜백 주입으로 끊는다. (#4a: 토큰만 지우고 authed가 잔존하던 버그)
let onAuthFail: (() => void) | null = null;
export const setAuthFailHandler = (fn: () => void) => {
  onAuthFail = fn;
};

export async function hasSession(): Promise<boolean> {
  return (await SecureStore.getItemAsync(REFRESH_KEY)) != null;
}

async function setSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  sessionGen++;
}

export async function logout() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  sessionGen++;
}

async function refreshAccess(): Promise<void> {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) {
    onAuthFail?.(); // 세션 없음 → 게이트를 /login으로
    throw new AuthRequiredError();
  }
  const res = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { authorization: `Bearer ${refresh}` },
  });
  if (!res.ok) {
    await logout();
    onAuthFail?.(); // refresh 거부(만료 등) → 토큰 삭제와 함께 authed도 내린다
    throw new AuthRequiredError();
  }
  accessToken = (await res.json()).accessToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// 인증 포함 fetch. 401이면 refresh 후 1회 재시도.
export async function api(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const gen = sessionGen; // 이 요청이 속한 세션
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_URL}/v1${path}`, { ...init, headers });
  if (res.status === 401 && retry) {
    await refreshAccess();
    // 요청 중 로그아웃/계정전환이 일어났으면 재시도가 다른 계정 토큰으로 나가 오귀속됨 → 중단.
    if (sessionGen !== gen) throw new AuthRequiredError();
    return api(path, init, false);
  }
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? 'error');
  return body;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? 'error');
  await setSession(body);
}

export async function signup(email: string, password: string, nickname: string) {
  const res = await fetch(`${API_URL}/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, nickname }),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? 'error');
  await setSession(body);
}
