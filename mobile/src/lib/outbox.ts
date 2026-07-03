import * as SQLite from 'expo-sqlite';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { QueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { ClimbResponseSchema, type ClimbPayload, type Course } from './schemas';

// 04 §3 outbox + 산 상세 프리페치 캐시 (위저드의 오프라인 판정 소스)
const db = SQLite.openDatabaseSync('hiking.db');
db.execSync(`
  CREATE TABLE IF NOT EXISTS climb_drafts (
    local_uuid TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    state TEXT NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    last_attempt_at TEXT,
    last_error TEXT,
    server_result_json TEXT,
    captured_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS course_cache (
    mountain_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    cached_at TEXT NOT NULL
  );
`);

// ---- 프리페치 캐시 (04 §5 프리페치 계약) ----
export function cacheCourses(mountainId: string, courses: Course[]) {
  db.runSync(
    'INSERT OR REPLACE INTO course_cache (mountain_id, payload_json, cached_at) VALUES (?, ?, ?)',
    [mountainId, JSON.stringify(courses), new Date().toISOString()],
  );
}

export function getCachedCourses(mountainId: string): Course[] | null {
  const row = db.getFirstSync<{ payload_json: string }>(
    'SELECT payload_json FROM course_cache WHERE mountain_id = ?',
    [mountainId],
  );
  return row ? JSON.parse(row.payload_json) : null;
}

// ---- outbox ----
export type Draft = {
  local_uuid: string;
  payload_json: string;
  state: 'queued' | 'uploading' | 'confirmed' | 'failed_permanent';
  attempt_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  server_result_json: string | null;
  captured_at: string;
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}
export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function insertDraft(payload: ClimbPayload) {
  db.runSync(
    'INSERT INTO climb_drafts (local_uuid, payload_json, state, captured_at) VALUES (?, ?, ?, ?)',
    [payload.clientRef, JSON.stringify(payload), 'queued', payload.capturedAt],
  );
  emit(); // 축하 연출 트리거 = insert 완료 (04 §4.1)
}

export function deleteDraft(clientRef: string) {
  db.runSync('DELETE FROM climb_drafts WHERE local_uuid = ?', [clientRef]);
  emit();
}

export function listDrafts(states: Draft['state'][]): Draft[] {
  const q = states.map(() => '?').join(',');
  return db.getAllSync<Draft>(
    `SELECT * FROM climb_drafts WHERE state IN (${q}) ORDER BY captured_at DESC`,
    states,
  );
}

// pending 색칠의 SSOT = outbox 파생 Set (04 §1)
export function pendingCourseIds(): Set<string> {
  const set = new Set<string>();
  for (const d of listDrafts(['queued', 'uploading'])) {
    const courseId = JSON.parse(d.payload_json).courseId;
    if (courseId) set.add(courseId);
  }
  return set;
}

// ---- flush (04 §6: 트리거당 1회, in-flight 락은 UX용 — 서버가 client_ref 멱등이라 데이터 안전) ----
let inFlight = false;
let queryClient: QueryClient | null = null;

export async function flush() {
  if (inFlight) return;
  inFlight = true;
  try {
    const drafts = listDrafts(['queued']);
    for (const d of drafts) {
      db.runSync(
        "UPDATE climb_drafts SET state = 'uploading', attempt_count = attempt_count + 1, last_attempt_at = ? WHERE local_uuid = ?",
        [new Date().toISOString(), d.local_uuid],
      );
      emit();
      try {
        const res = await api('/climbs', { method: 'POST', body: d.payload_json });
        ClimbResponseSchema.parse(res); // 계약 검증(파싱 실패=5xx 취급으로 재큐)
        // 확정된 초안은 삭제 — 완등은 me/climbs(verified SSOT)로 이관되므로 보관 불필요.
        // ponytail: 서버 결과 로컬 보관 안 함(무한 누적 방지). 필요해지면 confirmed 상태 부활.
        db.runSync('DELETE FROM climb_drafts WHERE local_uuid = ?', [d.local_uuid]);
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          // 4xx 종결 → failed_permanent (04 §4.2)
          db.runSync(
            "UPDATE climb_drafts SET state = 'failed_permanent', last_error = ? WHERE local_uuid = ?",
            [`${e.code}: ${e.message}`, d.local_uuid],
          );
        } else {
          // 5xx/네트워크 → queued 유지, 다음 트리거 대기
          db.runSync(
            "UPDATE climb_drafts SET state = 'queued', last_error = ? WHERE local_uuid = ?",
            [String(e), d.local_uuid],
          );
        }
      }
      emit();
    }
    if (drafts.length) queryClient?.invalidateQueries({ queryKey: ['me-climbs'] });
  } finally {
    inFlight = false;
  }
}

// 트리거 배선 (04 §6 ①): 콜드스타트 1회 + AppState active 복귀 + NetInfo 연결 회복
export function wireOutbox(qc: QueryClient) {
  queryClient = qc;
  flush();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') flush();
  });
  NetInfo.addEventListener((state) => {
    if (state.isConnected) flush();
  });
}
