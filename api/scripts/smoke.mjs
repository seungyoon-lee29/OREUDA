// v0 API 스모크: signup → courses → climbs 제출(성공/재생/중복) → me/climbs → delete
const B = (process.env.API_BASE ?? 'http://localhost:3000') + '/v1';
const j = (r) => r.json();
const uuid = () => crypto.randomUUID();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

// 1. public courses
const courses = await fetch(`${B}/courses?bbox=126.9,37.4,127.11,37.7&zoom=12`).then(j);
ok('courses bbox', Array.isArray(courses) && courses.length === 8, `${courses.length} courses`);
const baegundae = courses.find((c) => c.name === '백운대 코스');
ok('course payload contract',
  !!baegundae?.checkpointPoint?.coordinates && baegundae?.verifyRadiusM === 150 &&
  baegundae?.path?.type === 'LineString');

// 1b. GET /mountains list
const mtns = await fetch(`${B}/mountains`).then(j);
ok('mountains list', Array.isArray(mtns) && mtns.length > 0 && typeof mtns[0].courseCount === 'number', `${mtns.length} mountains, courseCount=${mtns[0]?.courseCount}`);

// 2. bad bbox → 400 envelope
const bad = await fetch(`${B}/courses?bbox=oops`);
const badBody = await bad.json();
ok('bbox 400 envelope', bad.status === 400 && badBody.error?.code === 'VALIDATION_BBOX');

// 3. signup
const email = `smoke-${Date.now()}@test.local`;
const su = await fetch(`${B}/auth/signup`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'hunter2hunter2', nickname: '스모크' }),
}).then(j);
ok('signup tokens', !!su.accessToken && !!su.refreshToken);
const H = { 'content-type': 'application/json', authorization: `Bearer ${su.accessToken}` };

// 4. mountains/:id
const mtn = await fetch(`${B}/mountains/${baegundae.mountainId}`).then(j);
ok('mountain detail', mtn.name === '북한산' && mtn.courses.length === 3);

// 5. climb 제출 — 백운대 checkpoint 91m 지점 → 201 verified, flags []
const ref1 = uuid();
const submit = (body) => fetch(`${B}/climbs`, { method: 'POST', headers: H, body: JSON.stringify(body) });
const payload = { courseId: baegundae.id, clientRef: ref1, lat: 37.6594, lng: 126.9789, accuracyM: 12, isMock: false, capturedAt: new Date(Date.now() - 3600e3).toISOString() };
const r1 = await submit(payload);
const c1 = await r1.json();
ok('climb verified 201', r1.status === 201 && c1.status === 'verified' && c1.flags.length === 0 && c1.leaderboardEligible === true, `dist=${c1.distanceM}m`);

// 6. 같은 clientRef 재제출 → 200 replayed
const r2 = await submit(payload);
const c2 = await r2.json();
ok('replay 200', r2.status === 200 && c2.replayed === true && c2.climbId === c1.climbId);

// 7. 같은 날 같은 코스 다른 clientRef → 200 rejected duplicate_day
const r3 = await submit({ ...payload, clientRef: uuid() });
const c3 = await r3.json();
ok('duplicate_day', r3.status === 200 && c3.status === 'rejected' && c3.reason === 'duplicate_day' && c3.existingClimbId === c1.climbId);

// 8. 미래 capturedAt → 400
const r4 = await submit({ ...payload, clientRef: uuid(), capturedAt: new Date(Date.now() + 3600e3).toISOString() });
ok('future capturedAt 400', r4.status === 400);

// 9. courseId null 폴백 → verified, distanceM null
const r5 = await submit({ courseId: null, clientRef: uuid(), lat: 37.44, lng: 126.96, accuracyM: 8, isMock: false, capturedAt: new Date(Date.now() - 1800e3).toISOString() });
const c5 = await r5.json();
ok('courseId null fallback', r5.status === 201 && c5.status === 'verified' && c5.distanceM === null);

// 10. mock flag
const r6 = await submit({ courseId: courses.find((c) => c.name === '원터골 코스').id, clientRef: uuid(), lat: 37.4243, lng: 127.0464, accuracyM: 10, isMock: true, capturedAt: new Date().toISOString() });
const c6 = await r6.json();
ok('mock flag → flagged verified', c6.status === 'verified' && c6.flags.includes('mock') && c6.leaderboardEligible === false, `flags=${JSON.stringify(c6.flags)}`);

// 11. me/climbs
const me = await fetch(`${B}/me/climbs`, { headers: H }).then(j);
ok('me/climbs totals', me.totalClimbs === 3 && me.totalMountains === 2 && me.climbs.length >= 3, `climbs=${me.climbs.length}, mountains=${me.totalMountains}`);
ok('me/climbs join', me.climbs.some((c) => c.mountain?.name === '북한산' && c.course?.difficulty === 'hard'));

// 12. 인증 없이 쓰기 → 401
const r7 = await fetch(`${B}/climbs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
ok('unauthenticated 401', r7.status === 401);

// 13. refresh
const rf = await fetch(`${B}/auth/refresh`, { method: 'POST', headers: { authorization: `Bearer ${su.refreshToken}` } }).then(j);
ok('refresh', !!rf.accessToken);
// access 토큰으로 refresh 시도 → 401
const rf2 = await fetch(`${B}/auth/refresh`, { method: 'POST', headers: { authorization: `Bearer ${su.accessToken}` } });
ok('refresh rejects access token', rf2.status === 401);

// 14. delete → 204, 재삭제 404
const d1 = await fetch(`${B}/climbs/${c1.climbId}`, { method: 'DELETE', headers: H });
const d2 = await fetch(`${B}/climbs/${c1.climbId}`, { method: 'DELETE', headers: H });
ok('soft delete 204 then 404', d1.status === 204 && d2.status === 404);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
