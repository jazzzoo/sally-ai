-- ================================================
-- 001_create_extensions.sql
-- 실행 순서: 1번째
-- 목적: UUID 생성에 필요한 PostgreSQL 확장 설치
-- ================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
