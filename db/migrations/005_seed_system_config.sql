-- ================================================
-- 005_seed_system_config.sql
-- 실행 순서: 5번째 (마지막)
-- 목적: system_config 테이블 초기값 설정 (PRD 16.3)
-- ================================================

INSERT INTO system_config (key, value, description) VALUES
    ('generation_disabled',         'false',    'true 시 모든 AI 질문 생성 즉시 차단 (비용 폭발 시 긴급 사용)'),
    ('daily_cost_limit_usd',        '1.00',     '일일 AI 비용 한도 (달러). 초과 시 generation_disabled 자동 true'),
    ('daily_cost_warning_usd',      '0.80',     '일일 AI 비용 경고 임계값. 이 값 초과 시 경고 로그 발생'),
    ('daily_generation_limit',      '10',       '게스트 1명당 하루 최대 질문 생성 횟수'),
    ('allowed_session_types',       '[1]',      'Phase 1: 세션 1만 허용. Phase 2: [1,2] 로 변경'),
    ('ai_model_primary',            'claude-haiku-4-5-20251001',  'AI 질문 생성에 사용하는 기본 모델'),
    ('ai_model_fallback',           'claude-sonnet-4-6',          '기본 모델 실패 시 폴백 모델'),
    ('ai_max_tokens',               '2048',     'AI 응답 최대 토큰 수'),
    ('beta_invite_only',            'true',     'true 시 초대 코드 없으면 앱 진입 불가'),
    ('max_projects_per_guest',      '5',        '게스트 1명당 최대 프로젝트 수')
ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------
-- 확인용 쿼리 (실행 후 결과 나오면 성공)
-- ------------------------------------------------
SELECT key, value, description FROM system_config ORDER BY key;
