import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://hiking-api-v0.fly.dev';

// access는 메모리, refresh는 SecureStore (04 §2 — 고정 refresh, rotation은 v1)
let accessToken: string | null = null;
const REFRESH_KEY = 'refresh_token';

export class AuthRequiredError extends Error {}

export async function hasSession(): Promise<boolean> {
  return (await SecureStore.getItemAsync(REFRESH_KEY)) != null;
}

async function setSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

export async function logout() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

async function refreshAccess(): Promise<void> {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) throw new AuthRequiredError();
  const res = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { authorization: `Bearer ${refresh}` },
  });
  if (!res.ok) {
    await logout();
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
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_URL}/v1${path}`, { ...init, headers });
  if (res.status === 401 && retry) {
    await refreshAccess();
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
