# 야장관리자

수용가 조사 현장에서 수집한 수도미터 데이터를 관리하는 웹 애플리케이션입니다.  
엑셀 업로드 → 현장 조사 입력 → 결과 엑셀 다운로드의 전체 흐름을 지원합니다.

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| **야장관리** | 수용가 목록 조회, 기물번호·지침·봉인여부 등 조사 결과 입력, 사진 첨부 |
| **엑셀 업로드** | 기존/대불 형식 엑셀을 자동 감지하여 DB에 수용가 목록 등록 |
| **차분 다운로드** | 이미 제출한 엑셀과 DB를 비교해 미처리 항목만 추출 |
| **양식 채우기** | 원본 양식 파일에 DB 데이터를 채워 완성된 엑셀로 다운로드 |
| **지도 뷰** | 조사 완료 여부를 지도에서 시각적으로 확인, 좌표 자동 등록 |

---

## 기술 스택

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **Supabase** — 인증 + PostgreSQL DB
- **Cloudflare R2** — 현장 사진 스토리지
- **Naver Maps API** — 지오코딩 + 지도 표시

---

## 로컬 실행

### 1. 패키지 설치

```bash
npm install
```

### 2. 환경변수 설정

프로젝트 루트에 `.env.local` 파일 생성:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
NEXT_PUBLIC_R2_PUBLIC_URL=

NEXT_PUBLIC_NAVER_CLIENT_ID=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
```

### 3. 개발 서버 실행

```bash
npm run dev
```

`http://localhost:3000` 접속 → 자동으로 로그인 페이지로 이동합니다.

---

## 배포 (Vercel)

1. GitHub에 레포지토리 push
2. Vercel에서 새 프로젝트로 import
3. 위 환경변수를 Vercel 프로젝트 설정에 추가
4. 배포 완료

---

## 프로젝트 구조

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

상세 구조와 설계 의도는 [`ARCHITECTURE.md`](./ARCHITECTURE.md)를 참고하세요.

---

## 관련 프로젝트

이 앱은 **booup-blog** (`booup.dev`)에서 야장관리 기능만 분리한 독립 프로젝트입니다.  
동일한 Supabase 인스턴스와 R2 버킷을 공유합니다.
