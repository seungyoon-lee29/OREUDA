# ws3 — 서울 16산 summit_point 좌표 검증 (v1, 2026-07-16)

`supabase/seed_seoul.sql` mountains insert 블록(16산, OSM ETL 산출)의 summit_point가
실제 정상에서 얼마나 어긋나는지 검증. 인증 반경 150m 기준.

## 방법론

교차 검증에 쓴 독립 소스:

1. **DEM 국지최고점 분석** (opentopodata.org, mapzen 30m): 시드 좌표 주변 ±225m(7×7, 75m 간격)
   및 의심 산은 ±600m 격자를 샘플링해 지형 최고점의 위치·변위를 측정. 시드가 국지최고점과
   일치하면 좌표가 정상 능선 위에 있다는 강한 증거. (30m DEM은 뾰족한 암봉을 10~40m
   낮게 읽음 — 도봉산 740→703, 수락산 638→607 등은 정상 패턴.)
2. **한국어/영어 위키백과 + Wikidata** 좌표·고도 (MediaWiki coordinates API, wbgetentities).
   단 en.wiki/Wikidata에 알려진 오류 다수 발견(아래 "소스 오류 메모").
3. **OSM Overpass**: bbox 내 natural=peak 341개 전수 조회 → ETL이 고른 노드와 대안 노드 식별.
4. **공식 웹**(서울시·구청·서울의공원)으로 고도·정상시설 확인.

판정: 시드 ↔ 최적 대조 좌표 haversine 거리 기준 **OK(<75m) / WARN(75~150m) / RED(>150m)**.

## 결과 표

| 산 | 시드 (lng,lat / m) | 대조 좌표·고도 | 대조 출처 | 거리 | 판정 |
|---|---|---|---|---|---|
| 도봉산 | 127.01546, 37.69884 / 740 | 자운봉 127.01497,37.69854 / 739.5m | en.wiki coord + ko.wiki 고도 + DEM(시드=국지최고, 703) | 55m | **OK** |
| 수락산 | 127.08134, 37.69926 / 638 | 주봉 637.7m, 정밀 독립좌표 없음. DEM 국지최고 시드 ±150m 내(+1m) | ko.wiki 고도 + DEM | ~0–150m | **OK** |
| 불암산 | 127.09524, 37.66365 / 508 | 508m. DEM 국지최고=시드. (en.wiki/Wikidata 좌표는 아차산 복사 오류라 배제) | ko.wiki 고도 + DEM | 0m(DEM) | **OK** |
| 인왕산 | 126.95788, 37.58495 / 339 | 126.95861,37.58472 / 338.2m | Wikidata(1″ 정밀) + ko.wiki + DEM(시드=국지최고) | 69m | **OK** |
| 북악산 | 126.97373, 37.59300 / 342 | 백악마루 342m. DEM 국지최고=시드. (en.wiki/Wikidata는 1.4km NE 북악팔각정 오지정 — 배제) | ko.wiki 고도 + DEM | 0m(DEM) | **OK** |
| 안산 | 126.94578, 37.57693 / 296 | 126.945,37.57667 / 295.9m (봉수대) | ko.wiki + DEM(시드=국지최고) | 75m* | **OK** (*wiki 좌표 저정밀, DEM은 시드 지지) |
| 아차산 | 127.10274, 37.56684 / 296 | 127.1025,37.56611 / 295.7m (정상=3보루) | en.wiki coord + 서울시 mediahub 고도 + DEM(시드=국지최고 288, 북쪽 대안노드 278보다 높음) | 84m* | **OK** (*wiki 좌표 저정밀 dim10000) |
| 용마산 | 127.09571, 37.57117 / 348 | 용마봉 348.5m. DEM 국지최고=시드. 정밀 독립좌표 없음 | 통설 고도 + DEM | 0m(DEM) | **OK** |
| 남산 | 126.98796, 37.55221 / 267 | 정상부(팔각정/N서울타워) 126.9881,37.5513 / 270.85m | ko.wiki 고도 + 타워·팔각정 위치 + DEM(262 평탄 정상부) | 99–118m | **WARN** |
| 대모산 | 127.07901, 37.47482 / 293 | 293m. DEM 국지최고 75m 서쪽(+12m, 수관 노이즈 수준) | 통설 고도 + DEM | ≤75m | **OK** |
| 구룡산 | 127.06122, 37.46893 / 306 | 127.06157,37.46895 / 306m | ko.wiki(서울) coord + DEM | 31m | **OK** |
| 우면산 | 127.00727, 37.47245 / **313** | 실정상(공군부대 내) ≈127.0090,37.4710 / **293m**; 소망탑(실질 인증점) 127.01300,37.47319 | 서초구청·ko.wiki 고도 + OSM/Wikidata 정상노드 + DEM 전산괴 스캔(최고 284 at 127.0090,37.4710; 시드 지점은 231) | **222m**(실정상) / 512m(소망탑) | **RED** |
| 개화산 | 126.80518, 37.58268 / **132** | 실정상(봉수대·헬기장) ≈126.80617,37.58167 / **128.4m** | 강서구·ko.wiki(128m 병기) + OSM 128.4 노드 + DEM(시드 107 < 대조 120, 고지대가 SE) | **142m** | **WARN** (RED 직전) |
| 봉산 | 126.90096, 37.61243 / 209 | 봉수대 정상 209m. DEM 국지최고=시드 | 통설 고도(은평·서울둘레길) + DEM | 0m(DEM) | **OK** |
| 백련산 | 126.92782, 37.59161 / 215 | 126.9275,37.59167 / 215.5m(은평정) | en.wiki coord + DEM(시드=국지최고) | 29m | **OK** |
| 일자산 | 127.15201, 37.52854 / **74** | 정상 해맞이광장 **134m**(둔촌동 산12); DEM 능선 최고 ≈127.1538,37.5291(122m) | 서울의공원·강동문화포털·서울시 해맞이명소 + DEM 능선 스캔 | **~170m**(DEM 크레스트 기준) | **RED** |

**분포: OK 12 / WARN 2 (남산·개화산) / RED 2 (우면산·일자산) / UNVERIFIED 0**

## RED 상세

### 우면산 — 좌표·고도 모두 오류, 게다가 제품 판단 필요
- 시드 (127.00727,37.47245)는 OSM의 어느 우면산 peak 노드와도 일치하지 않음(ETL 이상).
  시드 지점 DEM 231m — 정상이 아니라 북서 사면.
- 산괴 전체 DEM 스캔 최고점 284m는 (127.0090,37.4710) — OSM `우면산` 정상노드
  (127.00913,37.47048)·Wikidata Q12608886과 일치. 공식 고도는 **293m**(서초구청·ko.wiki·Wikidata).
  시드의 313m는 OSM 한 노드의 ele 태그 값으로, 공식 수치와 불일치.
- **함정**: 실제 최고점 일대는 공군부대라 등산객 접근 불가. 등산객의 실질 정상은
  **소망탑**(OSM: 127.01300,37.47319, DEM 261m)인데, 실정상에서 **455m** 떨어져 있음.
  → summit_point를 실정상으로 교정하면 소망탑에 선 사용자는 150m 반경 인증 **불가**.
  인증 지점으로서의 summit_point는 소망탑이어야 함 (elevation_m은 산 고도 293 유지).

### 일자산 — 고도 74m는 확정 오류(감사 ws4 M6 의심 적중), 좌표도 정상 아님
- 공식: 일자산 정상 **134m**, 정상에 해맞이광장(둔촌동 산12) — 서울의공원·강동구·서울시 일치.
- 시드 (127.15201,37.52854)/74m는 OSM의 `일자산 ele=74.2` 노드(남측 낮은 봉) 계열 — DEM상
  시드 지점 111m, 능선 서측 사면. ETL이 잘못된(또는 ele 오태깅된) 노드를 채택.
- DEM 능선 스캔 최고점은 (127.1538,37.5291) 부근 122m(30m DEM 스무딩 감안 시 134m와 부합).
  시드에서 ~170m → 반경 150m 밖. 참고로 ko.wiki 좌표(127.15199,37.53231)는 DEM 74m 골짜기
  (해맞이공원 시설지구)라 대조 좌표로 부적합.
- **정밀도 주의**: 해맞이광장의 미터급 좌표는 공개 소스에서 확정 못 함(네이버 지도는 캡차로
  API 조회 차단). 교정안 (127.1538,37.5291)은 DEM 크레스트 추정치로 오차 ±50m 가능 —
  반영 전 카카오/네이버 지도에서 "일자산 해맞이광장" 수동 확인 권장.

## WARN 상세

### 개화산 (142m — 반경 150m에 거의 닿음)
- 실질 정상(봉수대 복원·헬기장 전망대)은 OSM `개화산 ele=128.4` 노드(126.80617,37.58167) 쪽.
  DEM도 시드(107m)보다 SE(120m)가 높음. 고도도 강서구 기준 **128m**(ko.wiki는 132m 병기).
- 시드는 두 개의 중복 OSM 노드 중 낮은 지대의 132m 노드를 채택한 것. 142m 이탈은
  GPS 오차와 겹치면 정상 인증 실패 사례가 나올 수 있는 거리 → 교정 권장.

### 남산 (99~118m — 인증엔 지장 없음)
- 시드는 정상 광장(팔각정·N서울타워)에서 ~100m 북쪽 순환로 쪽. 정상부가 평탄(DEM 262
  플래토)해서 실사용 인증은 문제없을 것. 고도는 ko.wiki 270.85m vs 시드 267m(경미).
- 낮은 우선순위로 팔각정 좌표로 미세 조정 권장.

## 소스 오류 메모 (향후 ETL 참고)

- **en.wiki/Wikidata 불암산** 좌표 = 아차산 좌표 복사 오류. **북악산** = 북악팔각정(1.4km NE) 오지정.
  **en.wiki 구룡산** = 강원도 구룡산. 위키 계열 좌표는 산별로 정합성 검증 없이 쓰면 안 됨.
- OSM에 **아차산 peak 노드 2개**(295.7/남측=정상 3보루 ✓, 295/북측 4보루 방면), **우면산 2개**,
  **개화산 2개**, **일자산 저봉 노드** 존재 — 이름 매칭만으로 노드를 고르면 이번 같은 사고 재발.

## UPDATE 문 초안 (프로덕션 반영용 — 적용하지 말 것)

```sql
-- RED: 우면산 — 인증 지점을 소망탑(실질 정상, 접근 가능)으로. 고도는 공식 293m.
-- (실제 최고점 127.00913,37.47048은 공군부대 내 — 등산객 도달 불가, 소망탑에서 455m라 인증 불가)
update mountains
set summit_point = st_setsrid(st_makepoint(127.01300, 37.47319), 4326)::geography,
    elevation_m  = 293
where name = '우면산';

-- RED: 일자산 — 정상(해맞이광장) 능선 최고점 추정치. 반영 전 지도에서 해맞이광장 좌표 수동 확인!
update mountains
set summit_point = st_setsrid(st_makepoint(127.1538, 37.5291), 4326)::geography,
    elevation_m  = 134
where name = '일자산';

-- WARN: 개화산 — 봉수대·헬기장(실질 정상) 노드로 이동, 고도 128m(강서구).
update mountains
set summit_point = st_setsrid(st_makepoint(126.80617, 37.58167), 4326)::geography,
    elevation_m  = 128
where name = '개화산';

-- WARN(선택): 남산 — 팔각정/정상 광장으로 미세 조정, 고도 271m(ko.wiki 270.85).
update mountains
set summit_point = st_setsrid(st_makepoint(126.98810, 37.55133), 4326)::geography,
    elevation_m  = 271
where name = '남산';
```

주의: `seed_seoul.sql`의 **코스 블록** `checkpoint_point`가 구 summit_point를 복사하고 있다면
(우면산·일자산·개화산 코스) 함께 갱신 필요 — 코스 블록은 현재 다른 에이전트가 수정 중이므로
이 문서에서는 mountains만 다룸.

## 출처

- ko.wikipedia: [도봉산](https://ko.wikipedia.org/wiki/도봉산) · [수락산](https://ko.wikipedia.org/wiki/수락산) · [불암산](https://ko.wikipedia.org/wiki/불암산) · [인왕산](https://ko.wikipedia.org/wiki/인왕산) · [북악산](https://ko.wikipedia.org/wiki/북악산) · [안산 (서울)](https://ko.wikipedia.org/wiki/안산_(서울)) · [아차산](https://ko.wikipedia.org/wiki/아차산) · [남산 (서울)](https://ko.wikipedia.org/wiki/남산_(서울)) · [구룡산 (서울)](https://ko.wikipedia.org/wiki/구룡산_(서울)) · [우면산](https://ko.wikipedia.org/wiki/우면산) · [개화산](https://ko.wikipedia.org/wiki/개화산) · [일자산](https://ko.wikipedia.org/wiki/일자산)
- 좌표 API: ko/en Wikipedia MediaWiki coordinates API, [Wikidata](https://www.wikidata.org) (Q625942 인왕산, Q12608886 우면산 등)
- 공식: [서울시 mediahub — 아차산 295.7m](https://mediahub.seoul.go.kr/archives/2007818) · [서초구청 — 우면산 293m](https://www.seocho.go.kr/site/seocho/04/10405010900002015070703.jsp) · [강서문화관광 — 개화산](https://www.gangseo.seoul.kr/munhwa/mh050102) · [서울의공원 — 일자산 134m](https://parks.seoul.go.kr/parks/detailView.do?pIdx=112) · [강동문화포털 — 일자산근린공원](https://www.gangdong.go.kr/web/culture/contents/gdc010_020_020) · [서울 해맞이 명소 — 일자산 해맞이광장](https://www.seoul.go.kr/story/sunrise/html/sub_gangdong.html)
- 지형: [opentopodata](https://api.opentopodata.org) (mapzen 30m DEM), OSM Overpass API (peak 노드 전수 + 소망탑 POI)
