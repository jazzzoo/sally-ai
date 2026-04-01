-- ================================================
-- 004_create_indexes.sql
-- 실행 순서: 4번째
-- 목적: 자주 조회되는 컬럼에 인덱스 추가 (성능 최적화)
-- ================================================


-- projects 인덱스
CREATE INDEX idx_projects_guest_id     ON projects(guest_id);
CREATE INDEX idx_projects_deleted_at   ON projects(deleted_at);
CREATE INDEX idx_projects_access_token ON projects(access_token) WHERE access_token IS NOT NULL;

-- sessions 인덱스
CREATE INDEX idx_sessions_project_id   ON sessions(project_id);
CREATE INDEX idx_sessions_type         ON sessions(session_type);

-- question_lists 인덱스
CREATE INDEX idx_question_lists_session_id ON question_lists(session_id);

-- edits 인덱스
CREATE INDEX idx_edits_question_list_id ON edits(question_list_id);

-- analytics_events 인덱스
CREATE INDEX idx_analytics_guest_id    ON analytics_events(guest_id);
CREATE INDEX idx_analytics_event_type  ON analytics_events(event_type);
CREATE INDEX idx_analytics_created_at  ON analytics_events(created_at);
CREATE INDEX idx_analytics_session_id  ON analytics_events(session_id);

-- blocked_guests 인덱스
CREATE INDEX idx_blocked_guests_guest_id ON blocked_guests(guest_id);
