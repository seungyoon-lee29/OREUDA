import { z } from 'zod';

// 02 §5.1 코스 페이로드 — 오프라인 로컬 판정의 전제.
// verifyRadiusM min/max 가드는 단위 버그 조기 감지 (03 §5).
export const PointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]), // [lng, lat]
});

export const LineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});

export const CourseSchema = z.object({
  id: z.string().uuid(),
  mountainId: z.string().uuid(),
  name: z.string(),
  path: LineStringSchema,
  checkpointPoint: PointSchema,
  verifyRadiusM: z.number().min(10).max(2000),
  difficulty: z.enum(['easy', 'moderate', 'hard']).nullable(),
  distanceM: z.number().nullable(),
  durationMin: z.number().nullable(),
});
export type Course = z.infer<typeof CourseSchema>;
export const CoursesSchema = z.array(CourseSchema);

export const MountainSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  region: z.string().nullable(),
  elevationM: z.number().nullable(),
  summitPoint: PointSchema,
  verifyRadiusM: z.number(),
  courses: CoursesSchema,
});

// 03 §6 검증 입력 (outbox payload_json)
export const ClimbPayloadSchema = z.object({
  courseId: z.string().uuid().nullable(),
  clientRef: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number(),
  isMock: z.boolean(),
  capturedAt: z.string(),
});
export type ClimbPayload = z.infer<typeof ClimbPayloadSchema>;

// 02 §5.2 응답
export const ClimbResponseSchema = z.object({
  climbId: z.string(),
  clientRef: z.string(),
  status: z.enum(['verified', 'rejected']),
  flags: z.array(z.string()),
  distanceM: z.number().nullable(),
  climbedOn: z.string(),
  leaderboardEligible: z.boolean(),
  replayed: z.boolean().optional(),
  reason: z.string().optional(),
  existingClimbId: z.string().optional(),
});

// 탐색 목록 — GET /mountains 응답 (P0-2, 풀스택 계약)
export const MountainsListSchema = z.array(
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    region: z.string().nullable(),
    elevationM: z.number().nullable(),
    summitPoint: PointSchema,
    courseCount: z.number(),
  }),
);
export type MountainsListItem = z.infer<typeof MountainsListSchema>[number];

export const MeClimbsSchema = z.object({
  totalMountains: z.number(),
  totalClimbs: z.number(),
  climbs: z.array(
    z.object({
      climbId: z.string(),
      courseId: z.string().nullable(),
      status: z.string(),
      flags: z.array(z.string()),
      climbedOn: z.string(),
      mountain: z.object({ id: z.string(), name: z.string() }).nullable(),
      course: z.object({ name: z.string(), difficulty: z.string().nullable() }).nullable(),
    }),
  ),
});
