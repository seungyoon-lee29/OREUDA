// 서울 시계 내/걸친 추가 산 목록 (기존 시드: 북한산/관악산/청계산 제외)
// hint: 정상 근방 좌표(±2km 허용), nameRe: OSM peak name 매칭, ele: OSM ele 태그 없을 때 폴백,
// baseEle: 들머리 고도 근사(상승고도 = ele - baseEle, duration/difficulty 휴리스틱용),
// radius: 등산로 way 수집 반경(m), minDist/maxDist: 코스 길이 후보 범위(m)

export const OVERPASS = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_MIRROR = 'https://overpass.kumi.systems/api/interpreter';
export const UA = 'hiking-app-etl/0.1 (seoul seed; contact: dev@local)';

const big = { radius: 3000, minDist: 1500, maxDist: 7000 };
const mid = { radius: 2200, minDist: 900, maxDist: 4500 };
const small = { radius: 1800, minDist: 500, maxDist: 3500 };

export const MOUNTAINS = [
  { slug: 'dobong',   name: '도봉산', region: '서울 도봉·경기 의정부', nameRe: '도봉산|자운봉', hint: [127.014, 37.714], ele: 740, baseEle: 100, ...big },
  { slug: 'surak',    name: '수락산', region: '서울 노원·경기 의정부', nameRe: '수락산', hint: [127.078, 37.694], ele: 637, baseEle: 80, ...big },
  { slug: 'buram',    name: '불암산', region: '서울 노원·경기 남양주', nameRe: '불암산', hint: [127.083, 37.663], ele: 508, baseEle: 90, ...big },
  { slug: 'inwang',   name: '인왕산', region: '서울 종로·서대문', nameRe: '인왕산', hint: [126.958, 37.580], ele: 338, baseEle: 90, ...mid },
  { slug: 'bugak',    name: '북악산', region: '서울 종로·성북', nameRe: '북악산|백악산', hint: [126.981, 37.593], ele: 342, baseEle: 100, ...mid },
  { slug: 'ansan',    name: '안산',   region: '서울 서대문', nameRe: '^안산$|무악산', hint: [126.940, 37.575], ele: 296, baseEle: 60, ...mid },
  { slug: 'acha',     name: '아차산', region: '서울 광진·경기 구리', nameRe: '^아차산$', hint: [127.103, 37.554], ele: 295, baseEle: 60, ...mid },
  { slug: 'yongma',   name: '용마산', region: '서울 중랑·광진', nameRe: '^용마산$', hint: [127.094, 37.571], ele: 348, baseEle: 60, ...mid },
  { slug: 'namsan',   name: '남산',   region: '서울 중구·용산', nameRe: '^남산$', hint: [126.988, 37.551], ele: 262, baseEle: 60, ...small },
  { slug: 'daemo',    name: '대모산', region: '서울 강남', nameRe: '^대모산$', hint: [127.080, 37.474], ele: 293, baseEle: 60, ...mid },
  { slug: 'guryong',  name: '구룡산', region: '서울 서초·강남', nameRe: '^구룡산$', hint: [127.060, 37.470], ele: 306, baseEle: 60, ...mid },
  { slug: 'umyeon',   name: '우면산', region: '서울 서초', nameRe: '^우면산$', hint: [127.010, 37.466], ele: 293, baseEle: 50, ...mid },
  { slug: 'gaehwa',   name: '개화산', region: '서울 강서', nameRe: '^개화산$', hint: [126.803, 37.578], ele: 128, baseEle: 30, ...small },
  { slug: 'bongsan',  name: '봉산',   region: '서울 은평', nameRe: '^봉산$', hint: [126.898, 37.606], ele: 209, baseEle: 40, ...mid },
  { slug: 'baengnyeon', name: '백련산', region: '서울 은평·서대문', nameRe: '^백련산$', hint: [126.928, 37.596], ele: 216, baseEle: 50, ...small },
  { slug: 'hoam',     name: '호암산', region: '서울 금천·관악', nameRe: '^호암산$', hint: [126.930, 37.437], ele: 393, baseEle: 60, ...big },
  { slug: 'ilja',     name: '일자산', region: '서울 강동·경기 하남', nameRe: '^일자산$', hint: [127.155, 37.545], ele: 134, baseEle: 40, ...small },
  { slug: 'maebong',  name: '매봉산', region: '서울 성동', nameRe: '^매봉산$', hint: [127.021, 37.545], ele: 174, baseEle: 30, radius: 1200, minDist: 400, maxDist: 3000 },
];
