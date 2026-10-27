# meter-admin 개발·AI 협업 규칙

> 2026-10-27 / `master` @ `a2975dd` 기준.

## 구조

- Next.js 16 App Router / React 19 / TypeScript / Tailwind CSS v4
- `app/admin/`: 페이지와 Route Handler
- `features/auth/`, `features/meter-survey/`, `features/valve-survey/`, `features/excel-manager/`: 도메인별 API·컴포넌트·타입
- `shared/lib/supabase/`: Supabase 브라우저/서버/service-role 클라이언트
- `shared/lib/r2-storage.ts`: R2
- `shared/ui/AdminNav.tsx`: PC 사이드바/모바일 하단 탐색 및 사이드바 쿠키 상태
- `proxy.ts`: 로그인 세션 체크/리다이렉트

## AI와 개발자의 책임

1. 요구사항·예외 상황 정리: AI + 개발자.
2. 설계/정합성 정책·수용 기준 승인: 개발자.
3. 구현 및 테스트 초안: AI 중심 + 개발자 검토.
4. 검증: lint/build/테스트/실제 데이터 시나리오 + 개발자 리뷰.
5. 운영 배포·DB 수정·복구 판단: 개발자 승인.

작업 전 영향을 받는 테이블, 엑셀 양식, R2 이미지, 기존 서비스 공유 리소스, 개인정보/권한, 롤백 방법을 적으세요. AI에게 배포/운영 DB 변경을 무조건 위임하지 마세요.

## 반드시 유지할 현재 규칙

- 수용가 업로드의 동일 블록+`row_no` 업데이트는 **기본정보 5개 필드만**: `name`, `address`, `old_meter_number`, `final_reading`, `block`. 신규 행은 INSERT. 과거 문서의 전체 삭제/재생성 설명은 틀립니다.
- 밸브 업로드의 동일 블록+`valve_no` 매칭은 업로드 행을 UPSERT합니다. `valve_type` 중복 번호 문제, 현장 데이터 덮어쓰기를 확인하세요.
- 수용가 처리 완료 조건 여섯 필드와 종결 비고 `호폐`·`위치불명`·`적재`를 임의로 바꾸지 마세요. 엑셀 추출과 목록 집계의 차이도 테스트해야 합니다.
- 실명은 서버에서 `profiles.role` 확인 후 `admin`에게만 노출하고 일반 조회 응답은 서버에서 마스킹합니다. 클라이언트에 원본 실명 전달 금지.
- 원본 엑셀 양식 채우기는 JSZip/XML 기반 서식 보존 코드입니다. 단순 xlsx 라이브러리 저장 로직으로 교체하지 마세요.
- `옥내(건물앞)` 같은 위치 데이터 형식 및 기존 DB 값과의 호환성을 유지하세요.
- R2 이미지 객체 삭제와 DB 참조 변경은 서로 원자적이지 않으므로 실패 복구 로직을 검토하세요.
- 기존 문서에 따르면 `booup-blog`와 DB/R2를 공유합니다. 실제 분리 여부를 확인하기 전 단독 변경 금지.

## 보안 경고

기존 코드를 무조건 안전한 레퍼런스로 여기면 안 됩니다. `proxy.ts`의 세션 리다이렉트와 모든 Server Action의 인가는 동등하지 않습니다. 일부 service-role 조회 함수에 자체 로그인 검사가 누락되어 있고, 일부 쓰기 함수는 `admin` 권한 대신 **인증만** 검사합니다. 신규 API/Action은 사용자 인증 + 작업별 role 인가를 명시적으로 구현하세요. 기존 함수도 보안 점검 대상입니다. 서비스 키/R2 비밀키를 클라이언트, 로그, PR에 유출하지 마세요.

## 회귀 검증 체크

- `npm run lint`, `npm run build` (`package.json`에 `test` 스크립트 없음).
- 수용가·밸브의 신규/기존 엑셀 업로드 및 건수/필드 변화 확인.
- 중복 도면번호·중복 밸브번호, 부분 업로드 실패, 잘못된 양식.
- 관리자/뷰어 실명 마스킹, 로그인/비로그인/쓰기 권한.
- 사진 업로드·삭제·일괄 삭제, 지도 좌표, 모바일 화면.
- 원본 양식 채우기 후 서식·내용 비교.
- 운영 배포 전 백업 확인, 배포 후 스모크 테스트.

작업 결과에는 변경 파일, 데이터 영향, 테스트 결과, 남은 위험을 남깁니다.

참조: [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [MAINTENANCE_GUIDE.md](MAINTENANCE_GUIDE.md).
