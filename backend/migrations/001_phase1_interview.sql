-- =========================================================
-- Phase 1 Migration: 인터뷰 기능 테이블 추가
-- 실행: psql $DATABASE_URL -f migrations/001_phase1_interview.sql
-- =========================================================

BEGIN;

-- ── 인터뷰 링크 세션 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_list_id      UUID        REFERENCES question_lists(id) ON DELETE CASCADE,
  guest_id              UUID        NOT NULL,
  link_token            TEXT        UNIQUE NOT NULL,
  status                TEXT        DEFAULT 'active'
                                    CHECK (status IN ('active', 'in_progress', 'completed', 'abandoned', 'expired')),
  respondent_name       TEXT,
  respondent_session_id UUID,
  resume_token_hash     TEXT,
  completed_reason      TEXT,
  lock_version          INTEGER     DEFAULT 0,
  started_at            TIMESTAMPTZ,
  claimed_at            TIMESTAMPTZ,
  last_activity_at      TIMESTAMPTZ DEFAULT NOW(),
  abandoned_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

-- ── 대화 턴 저장 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_turns (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id   UUID        REFERENCES interview_sessions(id) ON DELETE CASCADE,
  role                   TEXT        NOT NULL CHECK (role IN ('assistant', 'user')),
  content                TEXT        NOT NULL,
  section                TEXT,
  question_index         INTEGER,
  turn_index             INTEGER     NOT NULL DEFAULT 0,
  message_type           TEXT        NOT NULL DEFAULT 'message',
  client_message_id      TEXT,
  metadata               JSONB       DEFAULT '{}',
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── 인터뷰 진행 상태 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_state (
  interview_session_id   UUID        PRIMARY KEY REFERENCES interview_sessions(id) ON DELETE CASCADE,
  current_section        TEXT        DEFAULT 'icebreaker',
  question_index         INTEGER     DEFAULT 0,
  followup_count         INTEGER     DEFAULT 0,
  completed_sections     JSONB       DEFAULT '[]',
  no_response_count      INTEGER     DEFAULT 0,
  current_question_key   TEXT,
  section_turn_count     INTEGER     DEFAULT 0,
  last_user_turn_id      UUID,
  last_assistant_turn_id UUID,
  transition_reason      TEXT,
  state_version          INTEGER     DEFAULT 0,
  question_answered      BOOLEAN     DEFAULT false,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── 자동 생성 리포트 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id   UUID        REFERENCES interview_sessions(id) ON DELETE CASCADE,
  guest_id               UUID        NOT NULL,
  status                 TEXT        DEFAULT 'pending'
                                     CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  result                 JSONB,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  completed_at           TIMESTAMPTZ
);

-- ── 인덱스 ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_interview_sessions_guest_id
  ON interview_sessions(guest_id);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_link_token
  ON interview_sessions(link_token);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_question_list_id
  ON interview_sessions(question_list_id);

CREATE INDEX IF NOT EXISTS idx_interview_turns_session_id
  ON interview_turns(interview_session_id);

CREATE INDEX IF NOT EXISTS idx_interview_turns_created_at
  ON interview_turns(interview_session_id, created_at);

-- 순서 정렬용 (turn_index 기반 조회)
CREATE INDEX IF NOT EXISTS idx_interview_turns_turn_index
  ON interview_turns(interview_session_id, turn_index DESC);

-- 멱등 처리용 UNIQUE (client_message_id가 NULL이면 중복 허용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_turns_client_message_id
  ON interview_turns(interview_session_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_interview_session_id
  ON reports(interview_session_id);

CREATE INDEX IF NOT EXISTS idx_reports_guest_id
  ON reports(guest_id);

COMMIT;
