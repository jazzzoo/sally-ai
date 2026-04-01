-- ================================================
-- 002_create_tables.sql
-- 실행 순서: 2번째
-- 목적: Sally.ai 8개 테이블 생성 (PRD 9.7 ERD 기반)
-- ================================================


-- ------------------------------------------------
-- 1. projects (프로젝트)
-- ------------------------------------------------
CREATE TABLE projects (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guest_id                UUID NOT NULL,
    recovery_email          VARCHAR(255),
    access_token            VARCHAR(60) UNIQUE,
    token_expires_at        TIMESTAMPTZ,
    token_remind_later_until TIMESTAMPTZ,
    name                    VARCHAR(255) NOT NULL DEFAULT '내 첫 인터뷰',
    description             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ  -- Soft Delete (NULL = 삭제 안 됨)
);


-- ------------------------------------------------
-- 2. sessions (세션)
-- ------------------------------------------------
CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_type        SMALLINT NOT NULL CHECK (session_type BETWEEN 1 AND 4),
    input_context       JSONB NOT NULL,
    system_prompt_used  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------
-- 3. question_lists (질문 리스트)
-- ------------------------------------------------
CREATE TABLE question_lists (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    version             INT NOT NULL DEFAULT 1,
    questions           JSONB NOT NULL,
    prompt_used         TEXT,
    generation_metadata JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------
-- 4. edits (수정 이력)
-- ------------------------------------------------
CREATE TABLE edits (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_list_id    UUID NOT NULL REFERENCES question_lists(id) ON DELETE CASCADE,
    question_number     INT NOT NULL,
    before_json         JSONB NOT NULL,
    after_json          JSONB NOT NULL,
    edit_type           VARCHAR(20) NOT NULL CHECK (edit_type IN ('manual', 'ai', 'style_change', 'regenerate')),
    edit_prompt         TEXT,
    edit_metadata       JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------
-- 5. analytics_events (분석 이벤트)
-- ------------------------------------------------
CREATE TABLE analytics_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
    session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
    guest_id    UUID NOT NULL,
    event_type  VARCHAR(50) NOT NULL,
    event_data  JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------
-- 6. admins (관리자 계정)
-- ------------------------------------------------
CREATE TABLE admins (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL CHECK (role IN ('viewer', 'admin')),
    name            VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);


-- ------------------------------------------------
-- 7. blocked_guests (차단된 게스트)
-- ------------------------------------------------
CREATE TABLE blocked_guests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guest_id        UUID NOT NULL UNIQUE,
    reason          TEXT,
    blocked_by      UUID REFERENCES admins(id) ON DELETE SET NULL,
    blocked_until   TIMESTAMPTZ,  -- NULL = 영구 차단
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------
-- 8. system_config (시스템 설정)
-- ------------------------------------------------
CREATE TABLE system_config (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES admins(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
