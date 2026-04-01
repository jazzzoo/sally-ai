import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticateGuest } from '../middleware/authenticateGuest.js';
import { withRLS, query } from '../models/db.js';
import { assemblePrompt } from '../services/aiService.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────
// Rate Limit 상태 (PRD 10.3, 11.5)
// Phase 1: 메모리 기반 (Phase 1.5에서 Redis로 교체)
// AI 생성: guest_id당 10회/일
// ─────────────────────────────────────────
const rateLimitMap = new Map(); // key: `${guestId}_${date}` → count

const checkDailyLimit = (guestId) => {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${guestId}_${today}`;
  const count = rateLimitMap.get(key) || 0;
  if (count >= 50) return false;
  rateLimitMap.set(key, count + 1);
  return true;
};

// ─────────────────────────────────────────
// POST /api/sessions
// 세션 생성 (프로젝트 + 세션 동시 생성)
// ─────────────────────────────────────────
router.post('/', authenticateGuest, async (req, res) => {
  const { business_summary, persona, style, additional_instructions } = req.body;

  if (!business_summary || business_summary.trim().length < 10) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: '사업 요약이 너무 짧아요. 더 자세히 적어주세요. (최소 10자)',
      },
    });
  }

  try {
    const result = await withRLS(req.guestId, async (client) => {
      const today = new Date().toISOString().slice(0, 10);
      const projectResult = await client.query(
        `INSERT INTO projects (guest_id, name)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [req.guestId, `내 첫 인터뷰 - ${today}`]
      );

      let projectId;
      if (projectResult.rows.length > 0) {
        projectId = projectResult.rows[0].id;
      } else {
        const existingProject = await client.query(
          `SELECT id FROM projects
           WHERE guest_id = $1 AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          [req.guestId]
        );
        projectId = existingProject.rows[0].id;
      }

      const sessionResult = await client.query(
        `INSERT INTO sessions (project_id, session_type, input_context)
         VALUES ($1, $2, $3)
         RETURNING id, session_type, input_context, created_at`,
        [
          projectId,
          1,
          JSON.stringify({
            business_summary: business_summary.trim(),
            persona: persona?.trim() || '기본 가정 사용',
            style: style || '기본',
            additional_instructions: additional_instructions?.trim() || '',
          }),
        ]
      );

      return sessionResult.rows[0];
    });

    return res.status(201).json({
      success: true,
      session: {
        id: result.id,
        session_type: result.session_type,
        input_context: result.input_context,
        created_at: result.created_at,
      },
    });
  } catch (err) {
    console.error('[Sessions] POST / error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '세션 생성 중 오류가 발생했습니다.' },
    });
  }
});

// ─────────────────────────────────────────
// GET /api/sessions/:id
// 세션 상세 조회
// ─────────────────────────────────────────
router.get('/history', authenticateGuest, async (req, res) => {
    try {
        const result = await withRLS(req.guestId, async (client) => {
            return client.query(
                `SELECT ql.id, ql.title, ql.is_favorite, ql.created_at,
                        s.input_context
                 FROM question_lists ql
                 JOIN sessions s ON ql.session_id = s.id
                 JOIN projects p ON s.project_id = p.id
                 WHERE p.guest_id = $1
                 ORDER BY ql.is_favorite DESC, ql.created_at DESC`,
                [req.guestId]
            );
        });
        return res.json({ success: true, history: result.rows });
    } catch (err) {
        console.error('[Sessions] history error:', err.message);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } });
    }
router.get('/:id', authenticateGuest, async (req, res) => {
  const { id } = req.params;

  // generate-stream 경로와 충돌 방지
  if (id === 'generate-stream') return res.status(404).end();

  try {
    const result = await withRLS(req.guestId, async (client) => {
      return client.query(
        `SELECT s.*,
                json_agg(
                  json_build_object(
                    'id', ql.id,
                    'version', ql.version,
                    'created_at', ql.created_at
                  ) ORDER BY ql.version DESC
                ) FILTER (WHERE ql.id IS NOT NULL) as question_lists
         FROM sessions s
         LEFT JOIN question_lists ql ON ql.session_id = s.id
         WHERE s.id = $1
         GROUP BY s.id`,
        [id]
      );
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '세션을 찾을 수 없습니다.' },
      });
    }

    return res.json({ success: true, session: result.rows[0] });
  } catch (err) {
    console.error('[Sessions] GET /:id error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '세션 조회 중 오류가 발생했습니다.' },
    });
  }
});

// ─────────────────────────────────────────
// GET /api/sessions/:id/generate-stream
// SSE 스트리밍 질문 생성
//
// SSE 이벤트 흐름:
//   start → token(반복) → complete → done
//   에러 시: error → done
//
// [변경] POST → GET (SSE 표준은 GET)
// [변경] sendEvent에 event: 필드 추가 (이벤트명 구분)
// ─────────────────────────────────────────
router.get('/:id/generate-stream', authenticateGuest, async (req, res) => {
  const { id: sessionId } = req.params;

  // ── Rate Limit 체크 ──
  if (!checkDailyLimit(req.guestId)) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'DAILY_LIMIT_EXCEEDED',
        message: '오늘 생성 횟수를 초과했습니다. (하루 10회 제한) 내일 다시 시도해주세요.',
      },
    });
  }

  // ── 비용 하드 리미트 체크 ──
  const costCheck = await query(
    `SELECT value FROM system_config WHERE key = 'generation_disabled'`
  );
  if (costCheck.rows[0]?.value === 'true') {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: '일시적으로 서비스가 중단되었습니다. 잠시 후 다시 시도해주세요.',
      },
    });
  }

  // ── SSE 헤더 설정 ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // ── SSE 전송 헬퍼 (event: 필드 포함) ──
  const sendEvent = (eventName, data) => {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // ── 세션 조회 + 소유권 검증 ──
  let session;
  try {
    const sessionResult = await withRLS(req.guestId, async (client) => {
      return client.query(
        `SELECT s.*, p.guest_id
         FROM sessions s
         JOIN projects p ON s.project_id = p.id
         WHERE s.id = $1`,
        [sessionId]
      );
    });

    if (sessionResult.rows.length === 0) {
      sendEvent('error', { code: 'NOT_FOUND', message: '세션을 찾을 수 없습니다.' });
      sendEvent('done', {});
      return res.end();
    }

    session = sessionResult.rows[0];
  } catch (err) {
    sendEvent('error', { code: 'INTERNAL_ERROR', message: '세션 조회 오류' });
    sendEvent('done', {});
    return res.end();
  }

  // ── 프롬프트 조립 ──
  const inputContext = session.input_context;
  const systemPrompt = assemblePrompt(
    session.session_type,
    inputContext,
    ''
  );

  // ── 스트리밍 시작 ──
  sendEvent('start', { session_id: sessionId, session_type: session.session_type });

  const startTime = Date.now();
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = anthropic.messages.stream({
      model: process.env.AI_PRIMARY_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 8192,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: '위 지시에 따라 질문 리스트를 JSON 형식으로 생성해주세요. 마크다운 코드블록(```json 등)을 절대 사용하지 말고 순수 JSON만 출력하세요.',
        },
      ],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const token = event.delta.text;
        fullText += token;
        sendEvent('token', { text: token });
      }
      if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens;
      }
      if (event.type === 'message_start' && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    }

    // ── JSON 파싱 ──
    let parsed;
    try {
      const cleaned = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
      if (parsed.questions?.length !== 12) {
        console.warn(`[Sessions] 질문 개수 불일치: ${parsed.questions?.length}개`);
      }
    } catch (parseErr) {
      console.error('[Sessions] JSON parse error:', parseErr.message);
      console.error('[Sessions] Raw AI response:', fullText.slice(0, 500));
      sendEvent('error', { code: 'PARSE_ERROR', message: 'AI 응답 파싱 실패. 다시 시도해주세요.' });
      sendEvent('done', {});
      return res.end();
    }

    // ── 비용 계산 ──
    const cost = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;
    const generationTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── DB 저장 ──
    let questionListId;
    try {
      await withRLS(req.guestId, async (client) => {
        const versionResult = await client.query(
          `SELECT COALESCE(MAX(version), 0) + 1 as next_version
           FROM question_lists WHERE session_id = $1`,
          [sessionId]
        );
        const version = versionResult.rows[0].next_version;

        const qlResult = await client.query(
          `INSERT INTO question_lists (session_id, version, questions)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [sessionId, version, JSON.stringify(parsed)]
        );
        questionListId = qlResult.rows[0].id;

        await client.query(
          `INSERT INTO analytics_events
             (guest_id, project_id, session_id, event_type, event_data)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            req.guestId,
            session.project_id,
            sessionId,
            'question_generated',
            JSON.stringify({
              session_type: session.session_type,
              question_count: parsed.questions?.length || 0,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cost_usd: cost,
              generation_time_sec: parseFloat(generationTime),
              version,
            }),
          ]
        );
      });
    } catch (dbErr) {
      console.error('[Sessions] DB save error:', dbErr.message);
      // DB 저장 실패해도 complete는 보냄 (question_list_id가 undefined일 수 있음)
    }
    // ── 개별 질문 이벤트 전송 ──
    for (const ice of parsed.icebreakers || []) {
      sendEvent('icebreaker', {
        type: 'icebreaker',
        text: ice.text || ice.question_text || '',
        why: ice.why || '',
        follow_up: Array.isArray(ice.follow_up) ? ice.follow_up : [],
      });
    }
    for (let i = 0; i < (parsed.questions || []).length; i++) {
      const q = parsed.questions[i];
      sendEvent('question', {
        type: 'question',
        number: i + 1,
        index: i,              // ← 추가
        text: q.text || q.question_text || '',
        why: q.why || '',
        follow_up: Array.isArray(q.follow_up) ? q.follow_up
          : typeof q.follow_up === 'string' ? [q.follow_up]
            : [],
      });
    }
    // ── 완료 이벤트 ──
    sendEvent('complete', {
      question_list_id: questionListId,
      question_count: parsed.questions?.length || 0,
      icebreaker_count: parsed.icebreakers?.length || 0,
      metadata: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: parseFloat(cost.toFixed(6)),
        generation_time_sec: parseFloat(generationTime),
        model: process.env.AI_PRIMARY_MODEL || 'claude-haiku-4-5-20251001',
      },
    });

    sendEvent('done', {});
    res.end();

  } catch (err) {
    console.error('[Sessions] SSE stream error:', err.message);
    if (!res.writableEnded) {
      sendEvent('error', { code: 'AI_ERROR', message: 'Sally가 바빠요. 잠시 후 다시 시도해주세요.' });
      sendEvent('done', {});
      res.end();
    }
  }
});

// ─────────────────────────────────────────
// GET /api/sessions/history
// 히스토리 목록 조회
// ─────────────────────────────────────────
});

export default router;