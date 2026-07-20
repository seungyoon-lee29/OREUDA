import * as SQLite from 'expo-sqlite';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { QueryClient } from '@tanstack/react-query';
import { api, ApiError, currentSessionGen } from './api';
import { lastAccount, setLastAccount } from './prefs';
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
  CREATE TABLE IF NOT EXISTS active_hike (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    course_id TEXT NOT NULL,
    mountain_id TEXT NOT NULL,
    course_name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    start_altitude REAL
  );
`);
// 기존 설치본에 start_altitude 컬럼 추가(운동 요약 경사도용). 이미 있으면 throw → 무시.
// ponytail: SQLite는 IF NOT EXISTS 컬럼이 없어 try/catch가 표준 관용구.
try {
  db.execSync('ALTER TABLE active_hike ADD COLUMN start_altitude REAL');
} catch {
  /* 이미 존재 */
}

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

// ---- 활성 등반 세션 (등반 시작 → 진행 중 → 완등 인증 사이 상태) ----
// 등반은 몇 시간이라 앱 재시작을 넘겨 지속해야 함 → SQLite 단일 행(id=1). 완등 인증 성공 시 clear.
// ponytail: 이건 "시작했다"는 세션 플래그일 뿐. 인증은 순간 1점만 사용하고, 세션 중 위젯/알림 갱신은 hikeTracker.ts가 구독해 담당.
export type ActiveHike = {
  courseId: string;
  mountainId: string;
  courseName: string;
  startedAt: string;
  startAltitude: number | null; // 등반 시작 지점 GPS 고도(첫 fix). 경사도 계산용, 없으면 null.
};

const hikeListeners = new Set<() => void>();
function emitHike() {
  hikeListeners.forEach((fn) => fn());
}
export function subscribeHike(fn: () => void): () => void {
  hikeListeners.add(fn);
  return () => hikeListeners.delete(fn);
}

export function startHike(h: { courseId: string; mountainId: string; courseName: string }) {
  db.runSync(
    'INSERT OR REPLACE INTO active_hike (id, course_id, mountain_id, course_name, started_at) VALUES (1, ?, ?, ?, ?)',
    [h.courseId, h.mountainId, h.courseName, new Date().toISOString()],
  );
  emitHike();
}

export function getActiveHike(): ActiveHike | null {
  const row = db.getFirstSync<{ course_id: string; mountain_id: string; course_name: string; started_at: string; start_altitude: number | null }>(
    'SELECT course_id, mountain_id, course_name, started_at, start_altitude FROM active_hike WHERE id = 1',
  );
  return row
    ? {
        courseId: row.course_id,
        mountainId: row.mountain_id,
        courseName: row.course_name,
        startedAt: row.started_at,
        startAltitude: row.start_altitude,
      }
    : null;
}

// 등반 첫 GPS fix의 고도를 시작 고도로 1회 기록(경사도 계산용). WHERE start_altitude IS NULL이라
// 첫 값만 남고(=출발지≈들머리 고도) 이후 fix는 no-op. 워치 콜백에서 매 fix 호출해도 안전.
export function setHikeStartAltitude(altitude: number) {
  db.runSync('UPDATE active_hike SET start_altitude = ? WHERE id = 1 AND start_altitude IS NULL', [altitude]);
}

export function clearHike() {
  db.runSync('DELETE FROM active_hike WHERE id = 1');
  emitHike();
}

// 로그아웃 시 디바이스-로컬 완등 데이터 전부 폐기 — 다음 계정이 이전 사용자의
// 큐/진행세션/캐시를 상속하지 못하게(오귀속 차단). outbox·active_hike엔 소유자가 없으므로.
// ponytail: 계정 스위칭이 드문 v0라 전역 purge로 충분. 계정별 스코핑은 멀티유저 디바이스가 흔해지면 v1.
export function purgeLocalData() {
  db.runSync('DELETE FROM climb_drafts');
  db.runSync('DELETE FROM active_hike WHERE id = 1');
  emit();
  emitHike();
  queryClient?.clear();
}

// 로그인/가입 성공 시 단일 초크포인트 — 다른 계정이면 purge(오귀속 차단), 같은 계정 재로그인이면
// draft 보존 + flush. stores.ts의 보존 의도(refresh 만료 → 같은 계정 재로그인 시 미전송 완등 유지) 실현.
export function reconcileLocalDataForAccount(email: string) {
  // exact 비교 — 서버가 email을 대소문자 구분 매칭하므로(auth.ts) lowercase 정규화하면
  // 다른 서버 계정(Foo@ vs foo@)을 같은 계정으로 오판해 draft가 오귀속된다(리뷰 MEDIUM).
  const account = email.trim();
  if (lastAccount() !== account) purgeLocalData();
  else flush(); // 보존된 draft를 새 세션 토큰으로 즉시 제출 시도
  setLastAccount(account);
}

// ---- outbox ----
export type Draft = {
  local_uuid: string;
  payload_json: string;
  // awaiting_course: 캡처는 durable하나 코스 선택 전이라 아직 제출 큐에 없음 (flush 제외).
  //   선택/닫기/콜드스타트에서 queued로 승격. 04 §4.1 'insert=captured 시점' 계약.
  state: 'awaiting_course' | 'queued' | 'uploading' | 'failed_permanent';
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

// 04 §4.1: 로컬 판정 통과 즉시 insert = 성공(captured) 시점. courseId는 아직 null.
// state='awaiting_course'라 코스 선택 창 동안 flush(=제출) 대상이 아니다 —
// 네트워크 재연결 트리거가 코스 선택 전에 courseId=null로 조기 제출하는 레이스를 차단.
export function insertCapture(payload: ClimbPayload) {
  db.runSync(
    'INSERT INTO climb_drafts (local_uuid, payload_json, state, captured_at) VALUES (?, ?, ?, ?)',
    [payload.clientRef, JSON.stringify(payload), 'awaiting_course', payload.capturedAt],
  );
  emit(); // 성공 연출 트리거 = 캡처 durable (04 §4.1)
}

// 코스 선택 → payload에 courseId 부착하고 제출 큐로 승격.
export function attachCourse(clientRef: string, courseId: string) {
  const row = db.getFirstSync<{ payload_json: string }>(
    'SELECT payload_json FROM climb_drafts WHERE local_uuid = ?',
    [clientRef],
  );
  if (!row) return;
  const payload = JSON.parse(row.payload_json);
  payload.courseId = courseId;
  db.runSync(
    "UPDATE climb_drafts SET payload_json = ?, state = 'queued' WHERE local_uuid = ? AND state = 'awaiting_course'",
    [JSON.stringify(payload), clientRef],
  );
  emit();
}

// "나중에 선택" / 위저드 닫기 → courseId=null 그대로 제출 큐로 승격.
export function finalizeCapture(clientRef: string) {
  db.runSync(
    "UPDATE climb_drafts SET state = 'queued' WHERE local_uuid = ? AND state = 'awaiting_course'",
    [clientRef],
  );
  emit();
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
  const gen = currentSessionGen(); // 이 flush가 속한 세션
  try {
    const drafts = listDrafts(['queued']);
    for (const d of drafts) {
      // 로그아웃/계정전환이 flush 도중 일어나면 스냅샷의 남은 draft가 새 계정 토큰으로
      // 나가 오귀속됨 → 중단. 이 draft들은 purge로 이미 삭제됐거나 다음 세션에서 재큐.
      if (currentSessionGen() !== gen) break;
      db.runSync(
        "UPDATE climb_drafts SET state = 'uploading', attempt_count = attempt_count + 1, last_attempt_at = ? WHERE local_uuid = ?",
        [new Date().toISOString(), d.local_uuid],
      );
      emit();
      // 약신호(산)에서 POST가 무한정 매달리면 inFlight를 영구 점유해 이후 flush가 전부 막힌다.
      // 20s 타임아웃으로 abort → 네트워크 오류로 취급되어 queued 재큐, 다음 트리거에서 재시도.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const res = await api('/climbs', {
          method: 'POST',
          body: d.payload_json,
          signal: controller.signal,
        });
        ClimbResponseSchema.parse(res); // 계약 검증(파싱 실패=5xx 취급으로 재큐)
        // 확정된 초안은 삭제 — 완등은 me/climbs(verified SSOT)로 이관되므로 보관 불필요.
        // ponytail: 서버 결과 로컬 보관 안 함(무한 누적 방지). 필요해지면 confirmed 상태 부활.
        db.runSync('DELETE FROM climb_drafts WHERE local_uuid = ?', [d.local_uuid]);
      } catch (e) {
        // 429·401은 4xx지만 일시적이라 종결하면 완등 유실:
        //  - 429: 스로틀(IP 키 — CGNAT에선 남의 트래픽으로도 맞음). 시간 지나면 풀린다.
        //  - 401: 세션 만료(refresh 실패). 같은 계정 재로그인 후 재전송돼야 한다.
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401) {
          // 그 외 4xx 종결 → failed_permanent (04 §4.2)
          db.runSync(
            "UPDATE climb_drafts SET state = 'failed_permanent', last_error = ? WHERE local_uuid = ?",
            [`${e.code}: ${e.message}`, d.local_uuid],
          );
        } else {
          // 5xx/네트워크/abort/429/401 → queued 유지, 다음 트리거 대기
          db.runSync(
            "UPDATE climb_drafts SET state = 'queued', last_error = ? WHERE local_uuid = ?",
            [String(e), d.local_uuid],
          );
          // 429는 이 flush 전체가 스로틀 상태 — 남은 draft도 전부 429일 테니 계속 치면 가중만(리뷰 LOW)
          if (e instanceof ApiError && e.status === 429) {
            clearTimeout(timeout);
            emit();
            break;
          }
        }
      } finally {
        clearTimeout(timeout);
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
  // 콜드스타트 크래시 복구: 재시작 시점엔 실제 in-flight 업로드가 존재할 수 없으므로
  //  - awaiting_course: 코스 선택 전에 앱이 죽어 stranded된 미완결 캡처 → queued 승격(courseId=null 폴백)
  //  - uploading: flush 중(POST await 도중) 프로세스가 죽어 갇힌 초안 → 재큐잉.
  //    서버가 client_ref 멱등이라(§6) 원본이 실제로 도달했어도 재-POST는 replay로 안전 reconcile.
  db.runSync("UPDATE climb_drafts SET state = 'queued' WHERE state IN ('awaiting_course', 'uploading')");
  flush();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') flush();
  });
  NetInfo.addEventListener((state) => {
    if (state.isConnected) flush();
  });
}
