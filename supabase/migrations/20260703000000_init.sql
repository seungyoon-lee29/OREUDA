-- 02-backend-spec.md §1-3 초기 스키마. 이후 스키마 변경은 TypeORM migration이 정본(02 §4).

create extension if not exists postgis;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  provider text not null default 'password'
    check (provider in ('password', 'kakao', 'naver', 'apple')),
  provider_user_id text,
  nickname text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (provider, provider_user_id)
);

create table mountains (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  elevation_m int,
  summit_point geography(Point, 4326) not null,
  verify_radius_m int not null default 150,
  source_code text
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  mountain_id uuid not null references mountains (id),
  name text not null,
  path geometry(LineString, 4326) not null,
  checkpoint_point geography(Point, 4326) not null,
  distance_m int,
  duration_min int,
  difficulty text check (difficulty in ('easy', 'moderate', 'hard')),
  source_difficulty_raw text,
  source_id text unique -- 시딩 upsert 키 (06 §4)
);

-- 02 §3: climbed_on 생성 컬럼. AT TIME ZONE은 stable이라 생성 컬럼에 직접 못 쓰므로
-- immutable 래퍼 사용 (tzdata 변경 시 이론상 값이 달라질 수 있으나 KST는 고정 오프셋).
create function kst_date(timestamptz) returns date
  language sql immutable parallel safe
  return (($1 at time zone 'Asia/Seoul')::date);

create table climbs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  course_id uuid references courses (id),
  client_ref uuid not null,
  verified_point geography(Point, 4326) not null,
  gps_accuracy_m real,
  is_mock boolean not null default false,
  status text not null check (status in ('verified', 'rejected', 'pending')),
  flags text[] not null default '{}',
  distance_m real,
  captured_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  climbed_on date generated always as (kst_date(captured_at)) stored,
  deleted_at timestamptz,
  constraint uq_climbs_client_ref unique (user_id, client_ref)
);

-- 하루 1회(verified만): 거부가 재시도를 막지 않도록 partial (02 §3)
create unique index uq_climbs_daily on climbs (user_id, course_id, climbed_on)
  where status = 'verified' and deleted_at is null;

create index idx_courses_path on courses using gist (path);
create index idx_mountains_summit on mountains using gist (summit_point);
create index idx_climbs_user on climbs (user_id, status, climbed_on);

-- API는 NestJS 직결(postgres role, RLS 미적용). PostgREST anon 노출만 차단.
alter table users enable row level security;
alter table mountains enable row level security;
alter table courses enable row level security;
alter table climbs enable row level security;
