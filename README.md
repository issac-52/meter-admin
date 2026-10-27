# 야장관리자 (`meter-admin`)

> 2026-10-27 기준 `master` 커밋 `a2975dd` 소스 기반 운영 문서. 실서비스 운영 설정은 별도 확인이 필요합니다.

수도미터 수용가 조사 및 밸브류 조사 데이터를 관리하는 Next.js 웹 애플리케이션입니다. 엑셀 입력 → 현장 정보·사진 입력 → 진행상태 관리 → 엑셀 추출의 흐름을 지원합니다.

## 메뉴

| 메뉴 | 경로 | 설명 |
| --- | --- | --- |
| 로그인 | `/admin/login` | Supabase Auth 로그인 |
| 수용가조사 | `/admin/meter` | 검색·필터·수정·사진·지도·진행상태 |
| 밸브관리 | `/admin/valve` | 제수밸브, 공기밸브, 소화전 데이터 관리 |
| 분류관리 | `/admin/regions` | 지역과 블록 연결 |
| 엑셀관리자 | `/admin/meter-excel` | 수용가·밸브 엑셀 업로드/다운로드 및 수용가 원본 양식 채우기 |

PC는 사이드바, 모바일은 상단/하단 탐색 메뉴를 이용합니다.

## 핵심 데이터 동작

**수용가 업로드**: `수도미터목록` 시트가 있으면 대불 형식, 없으면 기존 형식으로 파싱합니다. 블록 선택 및 미리보기를 거쳐 등록합니다. 현재 `importFromExcel`은 동일 블록 + `row_no`에 해당하는 기존 행에서 `name`, `address`, `old_meter_number`, `final_reading`, `block`만 변경하고 새 번호만 추가합니다. 과거 문서의 *블록 전체 삭제 후 재등록* 설명은 현행 코드와 다릅니다.

**밸브 업로드**: 제수·공기·소화전 양식을 선택합니다. 동일 블록 + `valve_no` 행은 업로드 내용으로 갱신되어 수용가보다 기존 데이터에 미치는 영향이 큽니다. 두 업로드 모두 운영 데이터에 적용하기 전 백업 및 전후 대조가 필요합니다.

**조사 상태**: 일반 완료 판정은 `meter_number`, `reading`, `sealed`, `location`, `usage_type`, `floor`가 모두 존재하는지 확인하고 `호폐`·`위치불명`·`적재`는 종결 상태로 구분합니다. 일부 엑셀 추출 경로의 상태 필터는 다를 수 있습니다.

## 기술 스택

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- Supabase Auth / PostgreSQL
- Cloudflare R2: 수용가·밸브 조사 사진
- Naver Maps: 지도·주소 좌표화
- xlsx, JSZip, Zod: 엑셀 처리·양식 보존·입력 검증

## 로컬 실행

```bash
git clone https://github.com/issac-52/meter-admin.git
cd meter-admin
npm install
# .env.example을 복사하여 .env.local 작성
npm run dev
```

개발 URL은 `http://localhost:3000`입니다. `.env.example`에 Supabase URL/anon/service-role, R2 account/access/secret/bucket/public URL, Naver Maps 키 변수가 정의돼 있습니다. **비밀키를 GitHub에 커밋하지 마세요.**

검증 명령:

```bash
npm run lint
npm run build
npm run start
```

`package.json`에는 자동 `test` 스크립트가 없습니다. 빌드 통과만으로 운영 기능 검증이 완료되지 않습니다.

## 배포

저장소 문서상 배포 대상은 Vercel입니다. GitHub 연결 브랜치와 도메인, 현재 환경변수, 접근 권한은 인수인계 시 **실제 Vercel 콘솔에서 확인**해야 합니다. 배포 후 로그인·수용가 조회·밸브 조회·사진·엑셀의 스모크 테스트를 진행하세요.

## 폴더 구조

```text
app/admin/                 페이지·API route
features/auth/             인증
features/meter-survey/     수용가 관리
features/valve-survey/     밸브 관리
features/excel-manager/    엑셀 업무
shared/lib/supabase/       세션 및 DB 클라이언트
shared/lib/r2-storage.ts   사진 저장소
shared/ui/AdminNav.tsx     PC/모바일 탐색
shared/types/              도메인 타입
proxy.ts                   로그인 리다이렉트
```

## 안전사항과 추가 문서

기존 프로젝트 문서에 따르면 `booup-blog`와 Supabase 및 R2를 공유합니다. 운영 콘솔에서 현재 분리 여부를 확인하기 전에는 독립 프로젝트로 간주하거나 DB 스키마·버킷을 독단 변경하면 안 됩니다. 앱에서 다운로드한 엑셀은 DB 복구용 백업도 R2 사진 백업도 아닙니다.

- [ARCHITECTURE.md](ARCHITECTURE.md): 데이터/인증/저장 흐름과 고위험 영역
- [CLAUDE.md](CLAUDE.md): 개발 및 AI 협업 시 준수사항
- [MAINTENANCE_GUIDE.md](MAINTENANCE_GUIDE.md): 인수인계·운영·복구 체크리스트
