# Nitor8

> 린 고객개발 4세션 구조를 내장한 인터뷰 질문 생성 AI

---

## 빠른 시작

### 1. 환경변수 설정
```bash
cp .env.example .env
# .env 파일 열어서 실제 값 채우기
```

### 2. 패키지 설치
```bash
# 백엔드
cd backend && npm install

# 관리자 대시보드
cd ../admin && npm install

# 프론트 (Expo)
cd ../frontend && npm install
```

### 3. DB 마이그레이션
Railway 대시보드 → Query 탭에서 아래 순서로 실행:
```
db/migrations/001_create_extensions.sql
db/migrations/002_create_tables.sql
db/migrations/003_create_rls_policies.sql
db/migrations/004_create_indexes.sql
db/migrations/005_seed_system_config.sql
```

### 4. 실행
```bash
# 백엔드 (터미널 1)
cd backend && npm run dev

# 관리자 대시보드 (터미널 2)
cd admin && npm run dev

# 앱 (터미널 3)
cd frontend && npx expo start
```

### 5. 헬스체크 확인
```bash
curl http://localhost:3000/health
# → {"success":true,"data":{"status":"ok",...}}
```

---

## 폴더 구조

```
nitor8/
├── .devcontainer/
│   └── devcontainer.json     Codespaces 환경 설정
│
├── backend/                  Node.js API 서버
│   ├── src/
│   │   ├── app.js            서버 진입점
│   │   ├── routes/           API 라우트
│   │   ├── middleware/       인증, RLS, Rate Limit
│   │   ├── services/         Claude API 연동
│   │   ├── models/           DB 쿼리
│   │   └── utils/            로거(Winston)
│   ├── scripts/              테스트 스크립트
│   └── package.json
│
├── frontend/                 React Native (Expo Go)
│   ├── src/
│   │   ├── screens/          8개 화면
│   │   ├── store/            Zustand 상태
│   │   ├── api/              axios 클라이언트
│   │   └── components/       재사용 컴포넌트
│   └── package.json
│
├── admin/                    관리자 대시보드 (Vite + React)
│   ├── src/
│   │   ├── pages/            6개 페이지
│   │   ├── components/       레이아웃, 차트
│   │   ├── store/            Zustand (JWT)
│   │   ├── api/              axios + JWT 인터셉터
│   │   ├── types/            TypeScript 타입
│   │   └── utils/            유틸 함수
│   ├── vercel.json
│   └── package.json
│
├── db/
│   └── migrations/           SQL 마이그레이션 (001~005)
│
├── server/
│   └── prompts/              AI 프롬프트 파일
│
├── .env.example              환경변수 템플릿
├── .gitignore
├── package.json              루트 스크립트
├── README.md
└── vercel.json               백엔드 Vercel 배포 설정
```

---

## API 엔드포인트 (로컬 기준)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /health | 서버 상태 확인 |
| POST | /auth/guest | guest_id 발급 |
| POST | /projects | 프로젝트 생성 |
| POST | /sessions/:id/generate-stream | 질문 생성 (SSE) |
| PATCH | /question-lists/:id/questions/:num | 질문 수정 |
| GET | /question-lists/:id/export | 내보내기 |

> Vercel 배포 후에는 모든 경로 앞에 `/api` 추가됨
> 예: `https://nitor8.vercel.app/api/health`

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 앱 | React Native 0.74, Expo SDK 51 |
| 관리자 | React 18, Vite 5, Tailwind CSS 3, Recharts |
| 백엔드 | Node.js 20, Express 4 |
| DB | PostgreSQL (Railway) + RLS |
| AI | Claude API (Haiku 우선, Sonnet 폴백) |
| 배포 | Vercel (백엔드/관리자), Expo Go (앱) |