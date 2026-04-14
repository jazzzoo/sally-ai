-- Sally.ai Initial Schema
-- Migration: 000_initial_schema.sql

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id    UUID NOT NULL,
  name        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id),
  session_type  INTEGER DEFAULT 1,
  input_context JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(id),
  version     INTEGER DEFAULT 1,
  questions   JSONB,
  title       TEXT,
  is_favorite BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id    UUID,
  project_id  UUID,
  session_id  UUID,
  event_type  TEXT,
  event_data  JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS blocked_guests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id      UUID,
  blocked_until TIMESTAMPTZ,
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_guest_id        ON projects(guest_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id      ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_question_lists_session_id ON question_lists(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_guest_id ON analytics_events(guest_id);
