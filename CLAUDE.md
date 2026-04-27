# CLAUDE.md — Nitor8 Project Context (구 Sally.ai)

> 이 파일을 먼저 읽고 작업을 시작하세요.
> 모든 코드 작업은 이 파일의 규칙을 따릅니다.

---

## 제품 개요

**Nitor8** — 비영어권 1~5인 창업자가 영어권 고객(US/UK)을 대상으로
고객개발 인터뷰를 할 때 도와주는 AI SaaS.

**핵심 가치:** "Stop worrying about your English, focus on listening."

**궁극 목표:** 아이디어 입력 → Nitor8가 인터뷰 설계 + 진행 + 리포트 + 다음 액션까지 전부 자동화.

---

## 현재 Phase

**Phase 1: AI 멀티턴 텍스트 인터뷰 + 자동 리포트**

핵심 기능 3가지:
1. 인터뷰 링크 생성 (창업자가 생성 → 응답자에게 공유)
2. AI 멀티턴 텍스트 인터뷰 (응답자가 링크 열면 Nitor AI와 1:1 채팅)
3. 자동 리포트 생성 (인터뷰 완료 후 Claude API로 자동 생성)

**Go/No-Go 기준:**
- Completion rate ≥ 60%
- 유료 전환 3명 이상
- NPS ≥ 40

---

## 기술 스택

```
Frontend:  React Native / Expo Web → Vercel (nitor8.vercel.app)
Backend:   Node.js / Express → Render (nitor8-backend.onrender.com)
Database:  PostgreSQL → Railway
AI:        Claude API (claude-haiku-4-5-20251001 primary, claude-sonnet-4-6 fallback)
Auth:      Guest ID 기반 (x-guest-id 헤더, UUID v4)
Module:    ES Modules (import/export, NOT require/CommonJS)
```

---

## 프로젝트 구조

```
nitor8/
├── frontend/
│   ├── App.js
│   ├── src/
│   │   ├── screens/
│   │   │   ├── IntroScreen.js
│   │   │   ├── CreateScreen.js
│   │   │   └── QuestionsScreen.js
│   │   ├── components/
│   │   │   ├── QuestionsPanel.js
│   │   │   ├── HistorySidebar.js
│   │   │   ├── EditPanel.js
│   │   │   ├── SlidePanel.js
│   │   │   ├── NavBar.js
│   │   │   └── ...
│   │   ├── store/
│   │   │   ├── useStore.js       ← Zustand 전역 상태
│   │   │   └── guestStorage.js   ← AsyncStorage 기반 guestId 관리
│   │   ├── api/
│   │   │   └── client.js         ← axios 기반 API 클라이언트
│   │   └── theme/
│   └── public/
│       └── roadmap.html
│
└── backend/
    ├── src/
    │   ├── app.js                ← Express 앱 진입점
    │   ├── models/
    │   │   └── db.js             ← PostgreSQL 풀 + withRLS + checkConnection
    │   ├── routes/
    │   │   ├── sessions.js       ← 세션 생성/조회/SSE 스트리밍
    │   │   └── questionLists.js  ← 질문 리스트 CRUD + regenerate
    │   ├── services/
    │   │   └── aiService.js      ← Claude API 호출 + 프롬프트 조립
    │   ├── middleware/
    │   │   └── authenticateGuest.js ← Guest ID 인증 미들웨어
    │   └── utils/
    └── server/
        └── prompts/
            ├── base.txt          ← 공통 베이스 프롬프트
            └── session1.txt      ← 세션1 프롬프트
```

---

## 기존 DB 스키마 (현재 운영 중)

```sql
-- 프로젝트 (guest 단위)
projects (
  id UUID PRIMARY KEY,
  guest_id UUID NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
)

-- 질문 생성 세션
sessions (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  session_type INTEGER DEFAULT 1,
  input_context JSONB,
  created_at TIMESTAMPTZ
)

-- AI 생성 질문 리스트
question_lists (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  version INTEGER DEFAULT 1,
  questions JSONB,
  title TEXT,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
)

-- 이벤트 로깅
analytics_events (
  id UUID PRIMARY KEY,
  guest_id UUID,
  project_id UUID,
  session_id UUID,
  event_type TEXT,
  event_data JSONB,
  created_at TIMESTAMPTZ
)

-- 시스템 설정
system_config (key TEXT PRIMARY KEY, value TEXT)

-- 차단 목록
blocked_guests (
  id UUID PRIMARY KEY,
  guest_id UUID,
  blocked_until TIMESTAMPTZ,
  reason TEXT
)
```

---

## Phase 1 추가 DB 스키마 (신규 구현)

```sql
-- 인터뷰 링크 단위 세션
interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_list_id UUID REFERENCES question_lists(id),
  guest_id UUID NOT NULL,
  link_token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active',     -- active | completed | abandoned
  respondent_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
)

-- 대화 턴 저장
interview_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id UUID REFERENCES interview_sessions(id),
  role TEXT NOT NULL,               -- 'assistant' | 'user'
  content TEXT NOT NULL,
  section TEXT,
  question_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- 인터뷰 진행 상태
interview_state (
  interview_session_id UUID PRIMARY KEY REFERENCES interview_sessions(id),
  current_section TEXT DEFAULT 'icebreaker',
  question_index INTEGER DEFAULT 0,
  followup_count INTEGER DEFAULT 0,
  completed_sections JSONB DEFAULT '[]',
  no_response_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- 자동 생성 리포트
reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id UUID REFERENCES interview_sessions(id),
  guest_id UUID NOT NULL,
  status TEXT DEFAULT 'pending',    -- pending | generating | completed | failed
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
)
```

---

## 코딩 규칙 (반드시 준수)

### 필수 패턴

```javascript
// 1. 보호된 DB 쿼리는 withRLS 사용
const result = await withRLS(req.guestId, async (client) => {
  return client.query('SELECT ...', [params]);
});

// 2. 인증 필요 라우트는 authenticateGuest 미들웨어
router.get('/:id', authenticateGuest, async (req, res) => { ... });

// 3. 에러 응답
return res.status(400).json({
  success: false,
  error: { code: 'ERROR_CODE', message: '사용자 메시지' },
});

// 4. 성공 응답
return res.json({ success: true, data: { ... } });

// 5. SSE 이벤트 전송
const sendEvent = (eventName, data) => {
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
};
```

### 금지 사항

```javascript
// ❌ require() 금지 (ES Modules 프로젝트)
// ✅ import 사용

// ❌ withRLS 없이 직접 쿼리 금지
// ✅ 항상 withRLS 래퍼 사용

// ❌ 공개 인터뷰 라우트에 authenticateGuest 적용 금지
//    /interview/:token 은 응답자용 공개 엔드포인트
```

### 환경 변수

```
DATABASE_URL          PostgreSQL 연결 문자열
ANTHROPIC_API_KEY     Claude API 키
AI_MODEL_PRIMARY      claude-haiku-4-5-20251001
AI_MODEL_FALLBACK     claude-sonnet-4-6
AI_MAX_TOKENS         2048 (질문생성) / 700 (인터뷰 턴)
NODE_ENV              development | production
ALLOWED_ORIGINS       CORS 허용 도메인
PORT                  3000
```

---

## AI 인터뷰 아키텍처

### Orchestrator 패턴 (핵심)

```
서버 → 현재 상태 읽음
     → 다음 액션 결정 (규칙 기반)
     → Claude에게 자연어 질문 생성 요청
     → 응답 저장 + 상태 업데이트
```

Claude에게 매 턴마다 전달하는 것:
```javascript
{
  system: systemPrompt,        // 고정
  messages: [
    ...recentTurns,            // 최근 4턴만
    { role: 'user', content: lastAnswer }
  ]
}
// 전체 히스토리 절대 금지 → 토큰 폭발
```

### 섹션 구조

```
icebreaker → context → problems → alternatives → wtp
```

### 종료 조건 (규칙 기반 우선)

```javascript
completedSections.length === 5  → wrap_up
noResponseCount >= 3            → abandoned
followupCount >= 2              → next_question
userSaidStop                    → wrap_up
```

---

## 리포트 JSON 구조

```javascript
{
  hypothesis_verdict: 'confirmed' | 'mixed' | 'rejected',
  top_pains: [{ title, quote, frequency }],   // max 3
  current_alternatives: [{ tool, complaint }],
  wtp_summary: '',
  next_actions: ['', '', ''],
  next_questions: ['', '', ''],
}
```

---

## 응답자 인터뷰 링크

```
URL:    https://nitor8.vercel.app/interview/:link_token
인증:   없음 (공개)
만료:   30일
재접속: 가능 (마지막 턴부터 이어서)
```

---

## 비즈니스 컨텍스트

- **타깃:** 비영어권 1~5인 창업자 (인도/동유럽/동남아/한국)
- **경쟁사:** Listen Labs($100M+), Outset($21M), Voicepanel($2.4M) — 모두 대기업 타깃
- **차별점:** 비영어권 특화 + Self-serve 저가
- **팀:** 2인 (개발자 재주 + 비즈니스 형)
- **수익:** 크레딧 과금 (5건 $29 / 20건 $79 / 50건 $149)

---

## Phase 1 개발 순서

```
Week 1: migration SQL + 링크 생성 API + 채팅 UI 기본
Week 2: AI 멀티턴 엔진 + 컨텍스트 관리 + follow-up
Week 3: 리포트 생성 + 앱 내 화면
Week 4: 베타 테스트 + 프롬프트 튜닝
```

---

## 의사결정 로그

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-04-13 | Phase 0.9 건너뛰고 Phase 1 바로 | 리포트 문제 해결에 Phase 1 기능 필요 |
| 2026-04-13 | 텍스트 기반 인터뷰 | Completion 61~79%, 비영어권 최적 |
| 2026-04-13 | 크레딧 모델 유지 | 프로젝트 단위 사용. 구독 이탈률 높음 |
| 2026-04-13 | Orchestrator 패턴 | 서버가 상태 관리, Claude는 자연어만 |
| 2026-04-13 | Whisper API Phase 1.5로 미룸 | 텍스트로 충분. 공수 대비 효과 낮음 |