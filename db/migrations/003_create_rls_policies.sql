-- ================================================
-- 003_create_rls_policies.sql
-- 실행 순서: 3번째
-- 목적: Row Level Security 정책 적용 (PRD 15.1 기반)
-- 핵심: guest_id 기반 데이터 격리
--       A 유저는 B 유저 데이터를 절대 못 봄
-- ================================================


-- ------------------------------------------------
-- RLS 활성화 (5개 테이블에 적용)
-- admins, blocked_guests, system_config 는 RLS 제외
-- (관리자 전용 테이블이므로 백엔드 JWT 미들웨어로 보호)
-- ------------------------------------------------
ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_lists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE edits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------
-- projects 정책
-- guest_id 가 현재 세션의 app.current_guest_id 와 일치할 때만 접근
-- ------------------------------------------------
CREATE POLICY guest_projects ON projects
    FOR ALL
    USING (
        guest_id = current_setting('app.current_guest_id', true)::UUID
    );


-- ------------------------------------------------
-- sessions 정책
-- 자신의 project 에 속한 session 만 접근
-- ------------------------------------------------
CREATE POLICY guest_sessions ON sessions
    FOR ALL
    USING (
        project_id IN (
            SELECT id FROM projects
            WHERE guest_id = current_setting('app.current_guest_id', true)::UUID
        )
    );


-- ------------------------------------------------
-- question_lists 정책
-- ------------------------------------------------
CREATE POLICY guest_question_lists ON question_lists
    FOR ALL
    USING (
        session_id IN (
            SELECT s.id FROM sessions s
            JOIN projects p ON s.project_id = p.id
            WHERE p.guest_id = current_setting('app.current_guest_id', true)::UUID
        )
    );


-- ------------------------------------------------
-- edits 정책
-- ------------------------------------------------
CREATE POLICY guest_edits ON edits
    FOR ALL
    USING (
        question_list_id IN (
            SELECT ql.id FROM question_lists ql
            JOIN sessions s ON ql.session_id = s.id
            JOIN projects p ON s.project_id = p.id
            WHERE p.guest_id = current_setting('app.current_guest_id', true)::UUID
        )
    );


-- ------------------------------------------------
-- analytics_events 정책
-- ------------------------------------------------
CREATE POLICY guest_analytics ON analytics_events
    FOR ALL
    USING (
        guest_id = current_setting('app.current_guest_id', true)::UUID
    );


-- ------------------------------------------------
-- Phase 1: 세션 타입 1만 허용 (PRD 15.1)
-- Phase 2 전환 시 이 정책 DROP 후 새로 생성
-- ------------------------------------------------
CREATE POLICY phase1_session_type ON sessions
    FOR INSERT
    WITH CHECK (session_type = 1);
