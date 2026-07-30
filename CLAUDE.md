# meter-admin

수용가 조사 야장관리 전용 Next.js 앱. booup-blog에서 분리된 독립 프로젝트.

## 스택
- Next.js 16 App Router, TypeScript, Tailwind CSS v4
- Supabase (auth + DB), Cloudflare R2 (이미지 스토리지), Naver Maps API
- next-themes (라이트/다크모드)

## 폴더 구조 (도메인 기준)

```
proxy.ts                                # 인증 보호 — 미인증 시 /admin/login 리다이렉트
app/
  admin/
    login/page.tsx
    meter/page.tsx                      # 야장관리 메인 (서버 컴포넌트)
    meter-excel/page.tsx                # 엑셀관리자
    api/
      template-fill/route.ts
      upload-meter-image/route.ts
      image-list/route.ts
      image-proxy/route.ts
      geocode/route.ts
features/
  meter-survey/                         # 야장관리 도메인
    api/                                # _actions.ts (getMeterRecords 등 Server Actions)
    components/                         # MeterTable, MeterEditModal, MeterMapView
    types/                              # DTO/ViewModel + mapper (maskName 포함)
  excel-manager/                        # 엑셀관리자 도메인
    api/                                # template-fill 연동, 업로드 파싱 (형식별 파서)
    components/                         # MeterExcelUpload, MeterExcelDiff, MeterTemplateFill
    types/
  auth/                                 # 인증 도메인
    api/                                # loginAction, logoutAction, profiles role 조회
components/admin/
  AdminNav.tsx                          # 사이드바 (접이식) + 다크모드 토글
shared/
  ui/
  lib/
    supabase/{admin,server,client}.ts
    r2-storage.ts
  types/                                # meter_records 공통 DTO 스키마 (Zod)
```

## 레이어 원칙

- **서버 데이터 조회는 서버 컴포넌트 + Server Actions로 유지한다.** 클라이언트 페칭(TanStack Query 등)으로 되돌리지 않는다. 필터/정렬/페이지네이션은 URL 쿼리스트링 → 서버 재조회 방식을 유지.
- **DTO(DB row)와 ViewModel을 분리**하고, 화면별 mapper 함수를 통해 변환한다 (`mapToTableRow`, `mapToMapMarker`, `mapToEditFormValues` 등). 컴포넌트에 DB row를 그대로 내려주지 않는다.
- **외부에서 들어오는 데이터는 진입점에서 Zod로 검증**한다 (엑셀 업로드 파싱 결과, 지오코딩 API 응답). `z.infer`로 타입 추론해서 중복 정의하지 않는다.
- 새 기능을 추가할 때도 `features/{도메인}/{api,components,types}` 구조를 따른다. 여러 도메인이 공유하는 것만 `shared/`로 옮긴다.

## 디자인 시스템

톤: 실용적/미니멀 (내부 관리툴). 무채색(zinc) 베이스 + 청록(teal/cyan) 포인트 컬러 하나만 사용, 장식적 요소 최소화.

```
                라이트        다크
background      #FAFAFA      #18181B
surface         #FFFFFF      #27272A
border          #E4E4E7      #3F3F46
text-primary    #18181B      #FAFAFA
text-secondary  #71717A      #A1A1AA
accent          #0E7490      #22D3EE
success          #16A34A      #22C55E
warning          #D97706      #F59E0B
```

- 타이포그래피: Pretendard. 숫자 컬럼(지침, 좌표, 도면번호)에는 `tabular-nums` 적용.
- 다크모드: `next-themes` + Tailwind v4 `@theme` CSS 변수.
- 사이드바: 펼침(라벨+아이콘) ↔ 접힘(아이콘만) 두 상태, localStorage에 상태 저장. 토글 버튼은 접힘 상태에서도 항상 클릭 가능한 위치 유지.
- 지도 뷰(`MeterMapView`)는 Naver Maps 자체 스타일을 존중한다. 다크모드 시 지도 자체는 그대로 두고 주변 UI(패널, 마커 팝업)만 다크 토큰을 적용한다.

## 민감정보 처리 원칙 (이름/주소)

- DB에는 실명을 그대로 저장한다 (업로드 시 마스킹하지 않음).
- 실명 노출 여부는 **서버(Server Action)에서 사용자 role(`profiles` 테이블: `admin` | `viewer`)을 확인한 뒤 결정**한다. `admin`은 실명, 그 외는 마스킹(`오**`)된 값을 반환.
- 마스킹 로직은 `features/meter-survey/types/`의 mapper에 위치하며, **클라이언트로는 이미 마스킹 여부가 결정된 값만 내려간다.** 네트워크 응답에 실명 원본이 노출되지 않는지는 새 조회 로직을 추가할 때마다 확인한다.
- 조회 로그, 컬럼 단위 RLS는 현재 범위 밖 (필요성 재검토 시 별도 논의).

## 절대 건드리면 안 되는 부분

- `template-fill/route.ts`의 JSZip 기반 XML 직접 조작 로직 (서식 보존 목적으로 xlsx 라이브러리 대신 직접 구현한 것 — xlsx 라이브러리로 되돌리지 말 것)
- `proxy.ts`의 인증 리다이렉트 흐름과 각 API/Server Action의 개별 `getUser()` 재검증 (쿠키 조작 방어 목적)
- 위치 데이터 형식 (`옥내(건물앞)` 등)과 파싱 정규식
- booup-blog와 공유하는 Supabase 인스턴스/R2 버킷 — 스키마나 버킷 구조를 독단적으로 바꾸지 말 것

## 관련 문서

- `ARCHITECTURE.md`: 기술 선택 이유, DB 스키마 상세, 엑셀 처리 로직, 인증 구조
- `README.md`: 로컬 실행/배포 방법

관련 프로젝트: booup-blog (F:/booup-blog, booup.dev)에서 야장관리 기능을 분리. 동일한 Supabase 인스턴스와 R2 버킷을 공유하며, 코드베이스는 독립적으로 관리됨.
