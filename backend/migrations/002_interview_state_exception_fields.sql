-- =========================================================
-- Migration 002: interview_state에 예외 처리 필드 추가
-- 실행: psql $DATABASE_URL -f migrations/002_interview_state_exception_fields.sql
-- =========================================================

BEGIN;

ALTER TABLE interview_state
  ADD COLUMN IF NOT EXISTS recovery_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skip_count             INTEGER NOT NULL DEFAULT 0;

COMMIT;
