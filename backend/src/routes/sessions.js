import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticateGuest } from '../middleware/authenticateGuest.js';
import { withRLS, query } from '../models/db.js';
import { assemblePrompt } from '../services/aiService.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────
// 메타데이터 검증 상수
// ─────────────────────────────────────────
const VALID_SECTIONS = new Set([
  'icebreaker', 'context', 'problems', 'alternatives', 'wtp',
]);

const VALID_INTENTS = new Set([
  'rapport_building', 'role_context', 'recent_workflow',
  'recent_pain_event', 'pain_frequency', 'pain_severity',
  'current_workaround', 'alternative_usage', 'switch_trigger',
  'decision_process', 'value_perception', 'budget_signal',
  'wtp_probe', 'objection_probe',
]);

const VALID_BUCKETS = new Set([
  'context', 'top_pain', 'alternatives', 'wtp_signal',
  'hypothesis_signal', 'next_action_signal', 'open_question', 'general',
]);

const INTENT_TO_SECTION = {
  rapport_building:  'icebreaker',
  role_context:      'icebreaker',
  recent_workflow:   'context',
  recent_pain_event: 'problems',
  pain_frequency:    'problems',
  pain_severity:     'problems',
  current_workaround: 'alternatives',
  alternative_usage:  'alternatives',
  switch_trigger:     'alternatives',
  decision_process:  'wtp',
  value_perception:  'wtp',
  budget_signal:     'wtp',
  wtp_probe:         'wtp',
  objection_probe:   'alternatives',
};

const BUCKET_BY_SECTION = {
  icebreaker:   'context',
  context:      'context',
  problems:     'top_pain',
  alternatives: 'alternatives',
  wtp:          'wtp_signal',
};

// 3단계 fallback: section → intent→section → 순서 기반
function resolveSection(item, index, total, forceSection) {
  if (forceSection) return forceSection;
  if (item.section && VALID_SECTIONS.has(item.section)) return item.section;
  if (item.intent && INTENT_TO_SECTION[item.intent]) {
    return INTENT_TO_SECTION[item.intent];
  }
  // 3단계: 순서 기반 (1·2단계 실패 시에만)
  if (index < Math.ceil(total * 0.25))       return 'context';
  if (index < Math.ceil(total * 0.55))       return 'problems';
  if (index < Math.ceil(total * 0.78))       return 'alternatives';
  return 'wtp';
}

function validateAndPatchQuestions(parsed) {
  let patchCount = 0;
  const icebreakers = parsed.icebreakers || [];
  const questions   = parsed.questions   || [];

  // ── icebreakers 검증 ──
  icebreakers.forEach((ice, i) => {
    // section (icebreaker 고정)
    if (!ice.section || !VALID_SECTIONS.has(ice.section)) {
      ice.section = 'icebreaker';
      patchCount++;
    }
    // intent
    if (!ice.intent || !VALID_INTENTS.has(ice.intent)) {
      ice.intent = '';
      if (ice.intent !== '') patchCount++;
    }
    // report_bucket
    if (!ice.report_bucket || !VALID_BUCKETS.has(ice.report_bucket)) {
      ice.report_bucket = 'context';
      patchCount++;
    }
    // id 자동 생성
    if (!ice.id) ice.id = `ib_${i + 1}`;
    // priority
    if (!ice.priority || typeof ice.priority !== 'number') {
      ice.priority = Math.min(i + 1, 3);
    }
  });

  // ── questions 검증 ──
  const total = questions.length;
  questions.forEach((q, i) => {
    // section (3단계 fallback)
    const resolvedSection = resolveSection(q, i, total, null);
    if (!q.section || !VALID_SECTIONS.has(q.section)) {
      const usedFallback = !q.section || !VALID_SECTIONS.has(q.section);
      const stage = (q.section && !VALID_SECTIONS.has(q.section)) ? 'invalid' :
                    (q.intent && INTENT_TO_SECTION[q.intent])      ? 'intent'  : 'positional';
      if (stage !== 'invalid' || usedFallback) {
        console.warn(`[Validator] q[${i}] section fallback(${stage}): "${q.section}" → "${resolvedSection}"`);
      }
      q.section = resolvedSection;
      patchCount++;
    }
    // intent
    if (!q.intent || !VALID_INTENTS.has(q.intent)) {
      if (q.intent) patchCount++;
      q.intent = '';
    }
    // report_bucket
    if (!q.report_bucket || !VALID_BUCKETS.has(q.report_bucket)) {
      q.report_bucket = BUCKET_BY_SECTION[q.section] || 'general';
      patchCount++;
    }
    // id 자동 생성
    if (!q.id) q.id = `q_${q.number || i + 1}`;
    // priority
    if (!q.priority || typeof q.priority !== 'number') {
      q.priority = Math.min(i + 1, 3);
    }
  });

  // ── 섹션별 최소 개수 경고 (에러 반환 안 함) ──
  const MIN_COUNTS = { context: 1, problems: 2, alternatives: 1 };
  const sectionCounts = {};
  questions.forEach((q) => {
    sectionCounts[q.section] = (sectionCounts[q.section] || 0) + 1;
  });
  for (const [sec, min] of Object.entries(MIN_COUNTS)) {
    const actual = sectionCounts[sec] || 0;
    if (actual < min) {
      console.warn(`[Validator] section "${sec}": ${actual} questions (min: ${min})`);
    }
  }

  if (patchCount > 0) {
    console.warn(`[Validator] patched ${patchCount} field(s) — check prompt if count is high`);
  } else {
    console.log('[Validator] all metadata valid — no patches needed');
  }

  return parsed;
}

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
            persona: persona?.trim() || 'default assumption',
            style: style || 'neutral',
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
// GET /api/sessions/history
// 히스토리 목록 조회
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
});

// ─────────────────────────────────────────
// GET /api/sessions/:id
// 세션 상세 조회
// ─────────────────────────────────────────
router.get('/:id', authenticateGuest, async (req, res) => {
  const { id } = req.params;

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
// ─────────────────────────────────────────
router.get('/:id/generate-stream', authenticateGuest, async (req, res) => {
  const { id: sessionId } = req.params;

  // ── HEAD 요청 처리 (rate limit 체크용) ──
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

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

  // ── SSE 전송 헬퍼 ──
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
          content: `Generate the question list in JSON format following the instructions above. Never use markdown code blocks. Output pure JSON only. ALL fields must be written in English only.`,
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

    // ── JSON 파싱 + 메타데이터 검증 ──
    let parsed;
    try {
      const cleaned = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
      console.log(`[Sessions] parsed: ${parsed.questions?.length} questions, ${parsed.icebreakers?.length} icebreakers`);
      parsed = validateAndPatchQuestions(parsed);
    } catch (parseErr) {
      console.error('[Sessions] JSON parse error:', parseErr.message);
      console.error('[Sessions] Raw AI response:', fullText.slice(0, 500));
      sendEvent('error', { code: 'PARSE_ERROR', message: 'AI 응답 파싱 실패. 다시 시도해주세요.' });
      sendEvent('done', {});
      return res.end();
    }

    // ── 개별 질문 이벤트 즉시 전송 (DB 저장 전) ──
    // token 스트림 직후 동기적으로 전송해야 브라우저에 도달함.
    // await(DB 저장)가 이벤트 루프에 양보하면서 아래 writes를 flush함.
    for (const ice of parsed.icebreakers || []) {
      sendEvent('icebreaker', {
        type:    'icebreaker',
        id:      ice.id,
        section: ice.section,
        text:    ice.text || ice.question_text || '',
        why:     ice.why || '',
      });
    }
    for (let i = 0; i < (parsed.questions || []).length; i++) {
      const q = parsed.questions[i];
      sendEvent('question', {
        type:    'question',
        id:      q.id,
        number:  i + 1,
        index:   i,
        section: q.section,
        text:    q.text || q.question_text || '',
        why:     q.why || '',
      });
    }

    // ── 비용 계산 ──
    const cost = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;
    const generationTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── DB 저장 (이벤트 전송 후 비동기 실행) ──
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
          `INSERT INTO question_lists (session_id, version, questions, title)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [sessionId, version, JSON.stringify(parsed), parsed.title || (() => {
            const bs = inputContext?.business_summary;
            if (!bs) return null;
            if (bs.length <= 30) return bs;
            const cut = bs.slice(0, 30);
            const lastSpace = cut.lastIndexOf(' ');
            return (lastSpace > 10 ? cut.slice(0, lastSpace) : cut) + '...';
          })()]
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
    }

    // ── 번역 생성 (비영어 business_summary인 경우) ──
    const isNonEnglish = /[^\x00-\x7F]/.test(inputContext.business_summary || '');
    if (isNonEnglish && questionListId) {
      try {
        const allItems = [
          ...(parsed.icebreakers || []),
          ...(parsed.questions   || []),
        ].map((q) => ({ id: q.id, text: q.text || '', why: q.why || '' }));

        const transResponse = await anthropic.messages.create({
          model: process.env.AI_MODEL_PRIMARY || 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          system: 'You are a professional translator. Output only valid JSON, no explanation.',
          messages: [{
            role: 'user',
            content: `Translate the following interview questions to the same language as this business summary:\n${inputContext.business_summary}\n\nFor each item, provide:\n- text_translated: natural translation of the question/text\n- why_translated: natural translation of the why explanation\n\nKeep interview/research terminology natural and professional.\nOutput JSON only:\n{"translations": [{"id": "q_1", "text_translated": "...", "why_translated": "..."}]}\n\nItems to translate:\n${JSON.stringify(allItems)}`,
          }],
        });

        const rawTrans = transResponse.content[0].text
          .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        const transData = JSON.parse(rawTrans);

        const transMap = {};
        for (const t of (transData.translations || [])) {
          transMap[t.id] = t;
        }
        for (const ice of (parsed.icebreakers || [])) {
          if (transMap[ice.id]) {
            ice.text_translated = transMap[ice.id].text_translated || null;
            ice.why_translated  = transMap[ice.id].why_translated  || null;
          }
        }
        for (const q of (parsed.questions || [])) {
          if (transMap[q.id]) {
            q.text_translated = transMap[q.id].text_translated || null;
            q.why_translated  = transMap[q.id].why_translated  || null;
          }
        }

        await withRLS(req.guestId, async (client) => {
          await client.query(
            `UPDATE question_lists SET questions = $1 WHERE id = $2`,
            [JSON.stringify(parsed), questionListId]
          );
        });
        console.log('[Sessions] Translation complete');
      } catch (transErr) {
        console.error('[Sessions] Translation failed (non-fatal):', transErr.message);
      }
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
      sendEvent('error', { code: 'AI_ERROR', message: 'Nitor가 바빠요. 잠시 후 다시 시도해주세요.' });
      sendEvent('done', {});
      res.end();
    }
  }
});

export default router;