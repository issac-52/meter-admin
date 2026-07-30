# meter-admin 리팩토링 가이드 (CLAUDE.md)

## 배경

`meter-admin`은 초기에 빠르게 만든 현장조사(야장관리) 웹앱입니다.
Next.js 16 App Router + Supabase + Cloudflare R2 + Naver Maps 조합이고, 5~10명이 실사용 중입니다.
기존 `ARCHITECTURE.md`, `README.md`에 설계 의도가 잘 정리되어 있으니, 리팩토링 시 그 문서의 "왜 이렇게 했는지"는 최대한 존중하고 **구조(폴더/레이어 분리)만** 개선합니다.

이번 리팩토링은 LoL 매치 분석기 프로젝트에서 정리한 아키텍처 원칙(도메인 기준 폴더, 통신/상태 레이어 분리, DTO↔ViewModel 매퍼, Zod 검증)을 적용하되, **이 프로젝트는 서버 컴포넌트 + Server Actions 기반**이라는 점에 맞게 조정합니다. FSD 연습이 목적이므로 도메인 분리와 타입 안전성 위주로 진행합니다.

⚠️ **중요**: 이 앱은 서버에서 DB를 직접 조회해 내려주는 구조(App Router 서버 컴포넌트)가 이미 의도적으로 잘 잡혀있습니다 (`meter/page.tsx`가 서버 컴포넌트, 필터/정렬은 URL 쿼리스트링). 이걸 TanStack Query 클라이언트 페칭으로 바꾸는 건 **퇴보**입니다. LoL 프로젝트처럼 "통신 레이어 vs TanStack Query 레이어"를 분리하는 패턴은, 이 프로젝트에서는 **"Server Actions/Route Handler 레이어 vs 클라이언트 상호작용 레이어"**로 재해석해서 적용합니다.

---

## 목표 도메인 구조

현재 파일들을 아래 3개 도메인 + 공통(shared)으로 분류합니다.

### 1. `features/meter-survey` (야장관리)
- `components/`: `MeterTable.tsx`, `MeterEditModal.tsx`, `MeterMapView.tsx`
- `api/`: `admin/meter/_actions.ts` (getMeterRecords, getCompletedRecords 등 CRUD Server Actions), `admin/api/upload-meter-image/route.ts`, `admin/api/image-list/route.ts`, `admin/api/image-proxy/route.ts`, `admin/api/geocode/route.ts`
- `types/`: `meter_records` DTO 정의 + 화면별 ViewModel + mapper
  - 예: `mapToTableRow(dto)`, `mapToMapMarker(dto)`, `mapToEditFormValues(dto)`

### 2. `features/excel-manager` (엑셀관리자)
- `components/`: `MeterExcelUpload.tsx`, `MeterExcelDiff.tsx`, `MeterTemplateFill.tsx`
- `api/`: `admin/api/template-fill/route.ts` (JSZip 기반 xlsx 조작), 업로드 파싱 로직 (기존 형식 `C` / 대불 형식 `DB` 상수 매핑 포함)
- `types/`: 엑셀 업로드 원본 row 타입(형식별로 2종) + `meter_records` insert용 타입 + mapper
  - 기존 형식과 대불 형식이 컬럼 매핑 방식이 다르므로(헤더 키 vs 인덱스), 이 둘을 **하나의 파서 함수로 억지로 합치지 말고** 형식별 파서 + 공통 결과 타입으로 정리

### 3. `features/auth` (인증)
- `api/`: `admin/_actions.ts`의 `loginAction`, `logoutAction`
- `components/`: `login/page.tsx` 내 로그인 폼 (있다면 분리)
- `proxy.ts`는 최상위 인증 미들웨어라 도메인 폴더로 옮기지 않고 루트에 유지

### 4. `shared/`
- `ui/`: `AdminNav.tsx` 등 여러 도메인이 같이 쓰는 UI
- `lib/`: `lib/supabase/{admin,server,client}.ts`, `lib/r2-storage.ts` (그대로 유지, 위치만 확정)
- `types/`: `meter_records` 테이블 원본 DTO 스키마 (아래 Zod 스키마 포함) — meter-survey와 excel-manager가 공통으로 참조하므로 여기 둠

---

## 레이어 분리 원칙 (이 프로젝트 버전)

- **서버 데이터 조회는 그대로 서버 컴포넌트 + Server Actions로 유지.** 리팩토링 대상이 아님.
- **클라이언트 상호작용이 필요한 부분만** (이미지 업로드 presigned URL 흐름, 지도 위 클릭 상호작용 등) 훅으로 분리:
  - `hooks/useMeterImageUpload.ts` 같은 식으로, R2 presigned URL 발급 → PUT 업로드 → DB 반영 3단계 흐름을 하나의 훅으로 캡슐화
  - 이건 TanStack Query의 `useMutation`을 써도 되고, 안 써도 됨 (실익이 크지 않으면 굳이 도입 안 해도 무방 — 과설계 주의)
- **API 함수와 화면 컴포넌트 사이에 mapper를 끼워 넣는 것**이 이번 리팩토링의 핵심. Server Component에서 DB row(DTO)를 그대로 props로 내려주지 말고, 화면에 필요한 ViewModel로 변환해서 내려줌.

---

## Zod 적용 지점 (외부 데이터가 들어오는 곳 우선)

1. **엑셀 업로드 파싱 결과** (`MeterExcelUpload.tsx` → 업로드 처리 로직)
   - 기존 형식 스키마, 대불 형식 스키마를 각각 Zod로 정의
   - 필수 컬럼(성명, 도로명주소, 도면번호 등)이 비어있거나 타입이 안 맞을 때 사용자에게 명확한 에러 메시지를 줄 수 있어 실사용 서비스에 특히 유용
2. **`geocode/route.ts` 응답** (Naver 지오코딩 API 응답)
   - 외부 API 응답이므로 형식이 예상과 다를 수 있음 → 최소한 lat/lng 필드 검증
3. **`meter_records` Server Action 응답**
   - 우선순위는 낮음 (내부 DB라 신뢰도가 높음), 위 두 개를 먼저 하고 여유 있으면 적용

`z.infer`로 타입을 뽑아서 `types/` 안의 DTO 타입과 중복 정의하지 않도록 합니다.

---

## 진행 순서 (Claude Code에게 요청할 순서)

1. `app/`, `components/admin/`, `lib/` 전체를 스캔해서 위 4개 분류(meter-survey / excel-manager / auth / shared) 기준으로 파일 매핑 표 작성 (이동 전 리뷰용)
2. `features/meter-survey`부터 이동 → 빌드 및 로그인 후 야장 목록/수정/지도 뷰 정상 동작 확인
3. `features/excel-manager` 이동 → 업로드/차분다운로드/양식채우기 각각 동작 확인 (특히 template-fill의 JSZip 서식 보존 로직은 건드리지 말고 위치만 이동)
4. `features/auth`, `shared` 정리
5. `meter_records` DTO/ViewModel 분리 + mapper 함수 작성 (MeterTable, MeterMapView, MeterEditModal 각각에 맞는 mapper)
6. Zod 스키마 도입 (엑셀 업로드 → 지오코딩 응답 순)
7. 단계마다 실제 로그인해서 각 페이지 스모크 테스트 (사용자 있는 서비스이므로 필수)
8. **리팩토링 완료 후 문서 갱신**:
   - `ARCHITECTURE.md`의 "핵심 파일 맵" 섹션을 새 폴더 구조로 교체 (기술 선택 이유, DB 스키마, 엑셀 처리 로직 설명 등 "왜"에 해당하는 내용은 그대로 유지)
   - `README.md`의 "프로젝트 구조" 트리만 새 구조로 교체 (로컬 실행법/배포법/기능 설명 등은 변경 없음)

---

## UI 개편 (라이트/다크모드 + 접이식 사이드바)

### 방향
- 톤: 실용적/미니멀. 내부 관리툴이라는 정체성을 살리고, 장식적 요소는 최소화.
- 포인트 컬러는 "수도 계량기 관리"라는 주제에 맞춰 청록(teal/cyan) 계열 하나만 사용. 그 외에는 무채색(zinc) 스케일로 절제.
- 데이터가 많은 테이블/좌표/지침 값 등 숫자는 `tabular-nums`를 적용해 자릿수가 흔들리지 않게 정렬 — 데이터 중심 툴이라는 성격을 드러내는 디테일.

### 디자인 토큰

라이트 모드
```
background   #FAFAFA
surface      #FFFFFF   (카드/모달/테이블 배경)
border       #E4E4E7
text-primary #18181B
text-secondary #71717A
accent       #0E7490   (인터랙티브 요소, 활성 상태, 링크 전용 — 장식용 아님)
success      #16A34A   (조사완료 상태 표시)
warning      #D97706   (미완료/주의 상태 표시)
```

다크 모드
```
background   #18181B
surface      #27272A
border       #3F3F46
text-primary #FAFAFA
text-secondary #A1A1AA
accent       #22D3EE   (다크 배경 대비를 위해 명도만 올림, 색상은 동일 계열 유지)
success      #22C55E
warning      #F59E0B
```

타이포그래피: Pretendard (한글 UI에 무난하고 무료). 숫자 컬럼(지침, 좌표, 도면번호 등)에는 `font-variant-numeric: tabular-nums` 적용.

### 구현 가이드 (Claude Code에게 줄 지침)

**다크모드**
- `next-themes` 패키지 사용 (App Router와 궁합 좋고, 새로고침 시 깜빡임 없이 저장된 테마 적용 가능)
- Tailwind v4의 `@theme` 방식으로 `globals.css`에 위 토큰을 CSS 변수로 정의 (`:root`에 라이트, `.dark`에 다크 값)
- 토글 버튼은 `AdminNav.tsx` 상단이나 하단에 배치 (해/달 아이콘)

**사이드바 접기/펼치기**
- 펼침 상태(라벨+아이콘, 예: 240px) ↔ 접힘 상태(아이콘만, 예: 64px) 두 가지 너비를 CSS transition으로 전환
- 접힘 상태에서는 메뉴 라벨 텍스트를 숨기고 아이콘만 남김 (완전히 사라지지 않고 아이콘 형태 유지)
- 상태는 localStorage에 저장해서 새로고침해도 유지 (또는 cookie로 저장하면 서버 컴포넌트에서 초기 렌더링 시 깜빡임 없이 반영 가능 — 여유 되면 이쪽을 권장)
- 토글 버튼은 사이드바 상단 고정, 접힘 상태에서도 항상 클릭 가능한 위치 유지

### 적용 우선순위
1. `AdminNav.tsx`에 사이드바 접기/펼치기 먼저 적용 (다크모드보다 구조 변경이 커서 먼저 하는 게 검증하기 편함)
2. `next-themes` 도입 + 다크모드 토큰 반영, 페이지 전체(테이블, 모달, 지도 뷰) 다크모드 스타일 확인
3. 상태(조사완료/미완료, 봉인/미봉인 등) 표시에 success/warning 색상 일관되게 적용
4. 지도 뷰(`MeterMapView.tsx`)는 Naver Maps 자체 스타일이 있으니, 다크모드 시 지도 자체는 그대로 두고 주변 UI(패널, 마커 팝업 등)만 다크 토큰 적용 — 지도 다크 테마까지 억지로 맞추려 하지 말 것

---

## 권한별 실명 표시 (마스킹 → role 기반 표시로 전환)

### 배경
현재 엑셀 업로드 시 `name`을 `오**` 형태로 마스킹해서 DB에 저장하고 있음. 실무자가 실명이 필요한 경우가 있어서, "DB에는 실명 저장 + 권한 있는 사용자만 실명 조회 가능"으로 전환. 조회 로그는 오버엔지니어링으로 판단해 이번 범위에서 제외.

### 작업 범위 (3가지만)

**1. `profiles` 테이블로 role 개념 추가**
- `auth.users`와 1:1로 연결되는 `profiles` 테이블 신규 생성 (`id` = auth.users.id FK, `role` 컬럼: `admin` | `viewer`)
- 기존 로그인 사용자들에게는 일단 전부 `admin`으로 초기값 넣거나, 수동으로 role 지정 (몇 명 안 되니 직접 지정 권장)
- role 조회는 로그인 세션에서 `supabase.auth.getUser()`로 user 가져온 뒤 `profiles` 테이블 join해서 확인

**2. 엑셀 업로드 시 마스킹 로직 제거**
- `MeterExcelUpload.tsx` 또는 관련 파싱 로직에서 `name`을 마스킹 처리하는 부분을 찾아서 제거 → 실명 그대로 `meter_records.name`에 저장
- 이미 마스킹된 상태로 저장된 기존 데이터는 이번 작업 범위에서는 건드리지 않음 (별도 마이그레이션 필요 여부는 이후 논의)

**3. 조회 시점에 서버에서 role 체크 → 마스킹 여부 결정**
- `meter/_actions.ts`의 `getMeterRecords`, `getCompletedRecords` 등 DB에서 레코드를 가져오는 함수들에서:
  1. 현재 로그인 사용자의 role을 `profiles` 테이블에서 조회
  2. role이 실명을 볼 수 있는 권한(`admin`)이면 `name` 그대로 반환
  3. 그 외(`viewer`)면 마스킹 함수를 거쳐서 반환 (`오**` 형식)
- 마스킹 함수(`maskName`)는 `features/meter-survey/types/`에 mapper 성격으로 위치 (DTO는 항상 실명 원본 유지, ViewModel로 변환하는 시점에 role에 따라 마스킹 적용)
- **중요**: 이 분기 처리는 반드시 서버 컴포넌트/Server Action 안에서 끝나야 함. 클라이언트로는 이미 마스킹 여부가 결정된 값만 내려가야 하고, 실명 원본이 네트워크 응답에 노출되면 안 됨 (개발자도구 네트워크 탭에서 확인 가능하므로 이 부분 반드시 검증)

### 이번에 하지 않는 것 (범위 제외)
- 조회 로그/감사 로그
- 컬럼 단위 RLS나 마스킹 전용 뷰(view) 분리 — 서버 로직에서의 role 체크로 충분하다고 판단
- 기존에 이미 마스킹돼 저장된 데이터의 복구/재처리

---

## 절대 건드리면 안 되는 부분

- `template-fill/route.ts`의 JSZip 기반 XML 직접 조작 로직 (서식 보존 목적으로 의도적으로 xlsx 라이브러리를 안 쓴 것 — 리팩토링 중 실수로 xlsx 라이브러리로 되돌리지 말 것)
- `proxy.ts`의 인증 리다이렉트 흐름과 각 API/Server Action의 개별 `getUser()` 재검증 (쿠키 조작 방어 목적)
- URL 쿼리스트링 기반 필터/정렬/페이지네이션 흐름 (서버 재조회 방식 유지)
- 위치 데이터 형식 (`옥내(건물앞)` 등)과 파싱 정규식
- booup-blog와 공유하는 Supabase 인스턴스/R2 버킷 — 스키마나 버킷 구조를 독단적으로 바꾸지 말 것
