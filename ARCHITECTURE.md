# 야장관리자 아키텍처

> 2026-10-27 / `master` @ `a2975dd` 정적 소스 검토. 실제 서비스·DB·스토리지 운영 설정의 검증을 뜻하지 않습니다.

## 구성

```text
브라우저 (데스크톱/모바일)
  └─ Next.js 16 App Router
      ├─ proxy.ts: 세션 검사와 로그인 리다이렉트
      ├─ app/admin: 페이지 및 API 라우트
      ├─ features/*: Server Actions / 클라이언트 컴포넌트
      ├─ Supabase Auth / PostgreSQL
      ├─ Cloudflare R2: 조사 사진
      └─ Naver Maps: 지도 및 주소-좌표 변환
```

도메인 폴더는 `features/meter-survey`, `features/valve-survey`, `features/excel-manager`, `features/auth`로 구분됩니다. 공통 접근 코드는 `shared/lib`, 데이터 타입은 `shared/types`, 탐색 컴포넌트는 `shared/ui/AdminNav.tsx`에 있습니다. 사이드바 접힘 상태는 **쿠키 `sidebar-collapsed`**에 저장되며, 과거 문서의 `localStorage` 표기는 구식입니다.

## 화면

| URL | 역할 |
| --- | --- |
| `/admin/meter` | 수용가 목록·필터·지도·사진·수정 |
| `/admin/valve` | 밸브/소화전 목록·지도·사진·수정 |
| `/admin/regions` | 지역/블록 분류 |
| `/admin/meter-excel` | 수용가 및 밸브 엑셀 입출력, 수용가 양식 채우기 |
| `/admin/login` | 인증 |

## 데이터 모델

- `meter_records`: `id`, `block`, `row_no`, `name`, `address`, `old_meter_number`, `meter_number`, `reading`, `sealed`, `location`, `usage_type`, `floor`, `note`, `survey_date`, `final_reading`, `image1_id` ~ `image4_id`, `lat`, `lng` 및 기타 조사 항목.
- `valve_records`: `id`, `block`, `valve_type` (`제수밸브`, `공기밸브`, `소화전`), `valve_no`, 주소·조사 항목, `image1_id`, `image2_id`, 위치 좌표.
- `regions`, `block_regions`: 지역 및 블록 할당. 새 블록 업로드 시 미분류로 생성 가능합니다.
- `profiles`: 사용자 `role` (`admin`/`viewer`)에 따라 수용가 실명 노출 여부 결정. Supabase `auth.users`와 연관됩니다.

SQL 마이그레이션이 저장소에서 확인되지 않으므로 실제 스키마 제약·인덱스·RLS·백업 정책은 Supabase 프로젝트에서 별도 확인해야 합니다.

## 수용가 엑셀 (현재 코드와 일치시키기)

`features/excel-manager/components/MeterExcelUpload.tsx`는 시트 `수도미터목록`이 있으면 대불 형식, 없으면 기존 형식으로 분기합니다. 대불은 지정 열 위치(데이터 5행부터), 기존은 헤더 매핑을 사용합니다. Zod 검증과 블록 선택/미리보기를 거칩니다.

`features/meter-survey/api/actions.ts` → `importFromExcel(block, rows)`:

1. 기존 블록의 `id`, `row_no` 조회.
2. 같은 `row_no`는 **`name`, `address`, `old_meter_number`, `final_reading`, `block`만 갱신**.
3. 신규 `row_no`는 INSERT.
4. 블록 분류 테이블에 미분류 블록 등록.

**같은 블록 전체 DELETE → INSERT가 아닙니다.** 업로드 파일에 없는 기존 행이 자동 제거되지도 않습니다. INSERT와 UPSERT가 별도 요청이므로 일부 성공 후 실패 가능성을 고려해야 합니다.

## 밸브 엑셀

`features/valve-survey/components/ValveExcelUpload.tsx`는 제수·공기·소화전 파일 형식을 감지하고 유형별 열 위치로 파싱합니다.

`features/valve-survey/api/actions.ts` → `importValvesFromExcel(block, rows)`는 **블록 + `valve_no`**로 기존 행을 찾고 매칭된 행에 업로드 데이터를 UPSERT합니다. 수용가와 달리 갱신 범위가 넓습니다. 매칭 키에 `valve_type`이 없으므로 한 블록 내 유형별 번호가 중복되는 경우 실데이터 검증이 필요합니다. 단일 트랜잭션 보장은 코드에서 확인되지 않습니다.

## 완료/종결 및 엑셀 추출

`getMeterRecords`의 처리 완료는 `meter_number`, `reading`, `sealed`, `location`, `usage_type`, `floor` 모두 채워진 상태이며 종결 사유 `호폐`, `위치불명`, `적재`는 별도로 집계합니다. `getCompletedRecords` 등 추출 함수의 조건은 이 기준과 완전히 같지 않을 수 있으므로 화면 카운트와 엑셀 건수를 같은 지표로 가정하지 않습니다.

수용가 원본 양식 채우기는 `features/excel-manager/api/template-fill.ts`의 **JSZip/XML 직접 수정**을 활용합니다. xlsx를 단순 재저장하여 기존 병합/서식을 망가뜨리지 마세요.

## 사진 및 지도

수용가는 최대 4개, 밸브는 최대 2개 이미지 경로를 DB에 보관합니다. Presigned URL을 통한 R2 업로드와 DB 경로 기록은 별도 작업이므로 한쪽만 성공할 위험이 있습니다. 일괄 이미지 삭제는 객체와 DB 참조를 모두 제거하며 복원 보장이 없습니다. 지도는 Naver Maps 및 지오코딩/역지오코딩을 사용하고, 좌표가 없는 항목은 지도에서 제외될 수 있습니다.

## 인증·권한 검토 필요

`proxy.ts`가 ` / ` 및 `/admin/:path*`에 대해 세션 확인과 리다이렉트를 합니다. **모든 Server Action이 자체 인증/인가를 완료한다는 기존 설명은 사실이 아닙니다.** 예를 들어 `getMeterRecords`, `getBlockList`, `getRegions`, `getRegionsWithBlocks`, `getBlockRegions`는 함수 시작에 명시적 `requireAuth()`가 없습니다. 일부 쓰기 Action의 `requireAuth()`는 로그인 여부만 판단하고 `admin` role을 검사하지 않습니다. service-role 클라이언트를 사용하므로 조회/쓰기 엔드포인트 단위의 보안 검토가 필요합니다.

현재 코드가 사용자 권한을 안전하게 분리한다는 보증으로 이 문서를 사용하면 안 됩니다. 특히 신규 API와 Server Action은 인증과 role 인가를 명시적으로 구현·테스트해야 합니다. 실명 마스킹은 서버 mapper를 통해 클라이언트 전송 전에 적용하는 설계입니다.

## 변경 고위험 영역

- 엑셀 파서/`importFromExcel`/`importValvesFromExcel`: 데이터 덮어쓰기·부분 실패.
- `template-fill.ts`: 원본 양식 서식 파손.
- `proxy.ts`, Auth, Supabase service-role: 개인정보/인가.
- R2 객체 삭제·업로드: DB 참조 불일치 및 비복구 손실.
- `regions`, `block_regions`: 분류 및 참조 영향.
- `booup-blog`와 공유된 것으로 기록된 DB/R2: 공유 현황을 검증하기 전 스키마·버킷 변경 금지.

운영 및 복원 절차는 [MAINTENANCE_GUIDE.md](MAINTENANCE_GUIDE.md)를 따릅니다.
