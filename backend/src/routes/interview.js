// backend/src/routes/interview.js
// 응답자용 공개 인터뷰 API (인증 없음)
//
// GET  /api/interview/:token           — 세션 정보 + 기존 대화 조회 (재접속)
// POST /api/interview/:token/start     — 이름 등록 + Sally 첫 인사 생성
// POST /api/interview/:token/chat      — 응답 전송 + Sally 다음 메시지 수신
// POST /api/interview/:token/heartbeat — 마지막 활동 시간 갱신

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import pool, { query } from '../models/db.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Rate Limit (토큰 기반, 간단 메모리) ──────────────────────────
const chatLimitMap = new Map(); // key: token_date → count
const checkChatLimit = (token) => {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${token}_${today}`;
  const count = chatLimitMap.get(key) || 0;
  if (count >= 100) return false; // 토큰당 100회/일
  chatLimitMap.set(key, count + 1);
  return true;
};

// ── 세션 + 질문 리스트 로드 헬퍼 ─────────────────────────────────
async function loadSession(token) {
  const result = await query(
    `SELECT
       is2.id,
       is2.question_list_id,
       is2.guest_id,
       is2.link_token,
       is2.status,
       is2.respondent_name,
       is2.respondent_session_id,
       is2.lock_version,
       is2.created_at,
       is2.expires_at,
       ql.questions  AS question_list,
       ql.title      AS interview_title,
       s.input_context
     FROM interview_sessions is2
     JOIN question_lists ql ON is2.question_list_id = ql.id
     JOIN sessions s ON ql.session_id = s.id
     WHERE is2.link_token = $1
       AND is2.expires_at > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

// ── 대화 조회 헬퍼 (turn_index 순 정렬) ──────────────────────────
async function loadRecentTurns(interviewSessionId, limit = 8) {
  const result = await query(
    `SELECT role, content, section, question_index, turn_index, created_at
     FROM interview_turns
     WHERE interview_session_id = $1
     ORDER BY turn_index ASC
     LIMIT $2`,
    [interviewSessionId, limit]
  );
  return result.rows;
}

// ── 인터뷰 상태 조회/생성 헬퍼 ───────────────────────────────────
async function getOrCreateState(interviewSessionId) {
  const existing = await query(
    `SELECT * FROM interview_state WHERE interview_session_id = $1`,
    [interviewSessionId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await query(
    `INSERT INTO interview_state (interview_session_id)
     VALUES ($1)
     RETURNING *`,
    [interviewSessionId]
  );
  return created.rows[0];
}

// ── 다음 질문 결정 ────────────────────────────────────────────────
function resolveNextQuestion(state, questionList) {
  const icebreakers = questionList.icebreakers || [];
  const questions = questionList.questions || [];

  if (state.current_section === 'icebreaker') {
    if (state.question_index < icebreakers.length) {
      return {
        section: 'icebreaker',
        question_index: state.question_index,
        text: icebreakers[state.question_index].text,
        isLast: false,
      };
    }
    return {
      section: 'main',
      question_index: 0,
      text: questions[0]?.text || null,
      isLast: questions.length <= 1,
    };
  }

  if (state.current_section === 'main') {
    if (state.question_index < questions.length) {
      return {
        section: 'main',
        question_index: state.question_index,
        text: questions[state.question_index].text,
        isLast: state.question_index >= questions.length - 1,
      };
    }
    return { section: 'completed', question_index: 0, text: null, isLast: true };
  }

  return { section: 'completed', question_index: 0, text: null, isLast: true };
}

// ── 상태 업데이트 (트랜잭션 내부용) ──────────────────────────────
async function advanceState(dbClient, interviewSessionId, current, questionList, userTurnId, assistantTurnId) {
  const icebreakers = questionList.icebreakers || [];
  const questions = questionList.questions || [];

  let next_section = current.current_section;
  let next_index = current.question_index + 1;
  let transition_reason = 'answered';

  if (current.current_section === 'icebreaker') {
    if (next_index >= icebreakers.length) {
      next_section = 'main';
      next_index = 0;
    }
  } else if (current.current_section === 'main') {
    if (next_index >= questions.length) {
      next_section = 'completed';
      next_index = 0;
      transition_reason = 'all_questions_answered';
    }
  }

  const current_question_key = next_section !== 'completed'
    ? `${next_section}_${next_index}`
    : null;

  await dbClient.query(
    `UPDATE interview_state
     SET current_section        = $1,
         question_index         = $2,
         followup_count         = 0,
         section_turn_count     = 0,
         current_question_key   = $3,
         question_answered      = false,
         transition_reason      = $4,
         last_user_turn_id      = $5,
         last_assistant_turn_id = $6,
         state_version          = state_version + 1,
         updated_at             = NOW()
     WHERE interview_session_id = $7`,
    [next_section, next_index, current_question_key, transition_reason, userTurnId, assistantTurnId, interviewSessionId]
  );

  return { current_section: next_section, question_index: next_index };
}

// ── AI 응답 생성 ──────────────────────────────────────────────────
async function generateSallyResponse(session, state, recentTurns, userMessage, isGreeting) {
  const questionList = session.question_list;
  const businessSummary = session.input_context?.business_summary || '';
  const respondentName = session.respondent_name || 'there';

  const next = resolveNextQuestion(state, questionList);

  let systemPrompt;
  let userPrompt;

  if (isGreeting) {
    systemPrompt = `You are Sally, a warm and friendly AI interviewer helping a startup conduct customer research.
Keep your response to 2-3 sentences. Be natural and conversational. Do not use bullet points or lists.`;

    const firstQuestion = next.text || 'Tell me a bit about yourself.';
    userPrompt = `You're starting a customer development interview.
Startup context: "${businessSummary}"
Respondent's name: "${respondentName}"

Write a brief, warm greeting (1 sentence) and then ask this first question naturally:
"${firstQuestion}"

Keep it casual and friendly, not formal.`;
  } else {
    const conversationHistory = recentTurns.map((t) =>
      `${t.role === 'assistant' ? 'Sally' : respondentName}: ${t.content}`
    ).join('\n');

    if (next.section === 'completed') {
      systemPrompt = `You are Sally, a warm AI interviewer. Write a brief, genuine closing message.
Keep it to 2-3 sentences. Thank the respondent sincerely. Do not ask any more questions.`;

      userPrompt = `The interview is now complete. The respondent's last message was: "${userMessage}"

Write a warm closing message thanking ${respondentName} for their time.`;
    } else {
      systemPrompt = `You are Sally, a friendly AI interviewer conducting customer research on behalf of a startup.
Keep each response to 1-2 sentences. Be natural and conversational.
- Briefly acknowledge what the respondent just said (1 sentence max, no "Great!" or "Interesting!")
- Then transition naturally into the next question
- Do not use bullet points, lists, or formal language
- Sound like a real conversation`;

      userPrompt = `Startup context: "${businessSummary}"

Recent conversation:
${conversationHistory}

${respondentName} just said: "${userMessage}"

Now ask this question naturally (after briefly acknowledging their response):
"${next.text}"`;
    }
  }

  const message = await anthropic.messages.create({
    model: process.env.AI_PRIMARY_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: parseInt(process.env.AI_MAX_TOKENS_INTERVIEW) || 700,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return {
    content: message.content[0].text,
    section: next.section,
    question_index: next.question_index,
    is_completed: next.section === 'completed',
  };
}

// ─────────────────────────────────────────────────────────────────
// GET /api/interview/:token
// 세션 정보 + 기존 대화 조회 (재접속 지원)
// ─────────────────────────────────────────────────────────────────
router.get('/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const session = await loadSession(token);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '유효하지 않거나 만료된 인터뷰 링크입니다.' },
      });
    }

    if (session.status === 'abandoned' || session.status === 'expired') {
      return res.status(410).json({
        success: false,
        error: { code: 'INTERVIEW_CLOSED', message: '종료된 인터뷰입니다.' },
      });
    }

    const turns = await loadRecentTurns(session.id, 50);

    return res.json({
      success: true,
      data: {
        id: session.id,
        status: session.status,
        respondent_name: session.respondent_name,
        interview_title: session.interview_title,
        turns,
        needs_name: !session.respondent_name,
      },
    });
  } catch (err) {
    console.error('[Interview] GET /:token error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/interview/:token/start
// 이름 등록 + Sally 첫 인사 생성
// Body:     { name }
// Response: { turns, is_completed, respondent_session_id, resume_token }
//           재접속 시 resume_token은 null
// ─────────────────────────────────────────────────────────────────
router.post('/:token/start', async (req, res) => {
  const { token } = req.params;
  const { name } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: '이름을 입력해주세요.' },
    });
  }

  try {
    const session = await loadSession(token);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '유효하지 않거나 만료된 인터뷰 링크입니다.' },
      });
    }

    if (session.status !== 'active' && session.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        error: { code: 'INTERVIEW_CLOSED', message: '이미 종료된 인터뷰입니다.' },
      });
    }

    if (!checkChatLimit(token)) {
      return res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      });
    }

    const isReconnect = !!session.respondent_session_id;
    const existingTurns = await loadRecentTurns(session.id, 50);

    // 재접속: 기존 세션 + 대화 존재 → resume_token은 null 반환
    if (isReconnect && existingTurns.length > 0) {
      return res.json({
        success: true,
        data: {
          turns: existingTurns,
          is_completed: session.status === 'completed',
          respondent_session_id: session.respondent_session_id,
          resume_token: null,
        },
      });
    }

    // 최초 시작 (또는 재시도: respondent_session_id 있으나 turns 없음)
    let respondentSessionId = session.respondent_session_id;
    let resumeTokenPlain = null;

    if (!isReconnect) {
      respondentSessionId = crypto.randomUUID();
      resumeTokenPlain = crypto.randomBytes(32).toString('hex');
      const resumeTokenHash = crypto.createHash('sha256').update(resumeTokenPlain).digest('hex');

      await query(
        `UPDATE interview_sessions
         SET respondent_name       = $1,
             respondent_session_id = $2,
             resume_token_hash     = $3,
             started_at            = NOW(),
             claimed_at            = NOW(),
             status                = 'in_progress',
             last_activity_at      = NOW()
         WHERE id = $4`,
        [name.trim(), respondentSessionId, resumeTokenHash, session.id]
      );
    } else {
      // 재시도 케이스: 이름만 갱신
      await query(
        `UPDATE interview_sessions
         SET respondent_name  = $1,
             last_activity_at = NOW()
         WHERE id = $2`,
        [name.trim(), session.id]
      );
    }
    session.respondent_name = name.trim();

    // 상태 초기화 또는 조회
    const state = await getOrCreateState(session.id);

    // Sally 첫 인사 생성
    const aiResponse = await generateSallyResponse(session, state, [], '', true);

    // 어시스턴트 턴 저장 (첫 턴이므로 turn_index = 0)
    await query(
      `INSERT INTO interview_turns
         (interview_session_id, role, content, section, question_index, turn_index)
       VALUES ($1, 'assistant', $2, $3, $4, 0)`,
      [session.id, aiResponse.content, aiResponse.section, aiResponse.question_index]
    );

    return res.json({
      success: true,
      data: {
        turns: [{ role: 'assistant', content: aiResponse.content }],
        is_completed: false,
        respondent_session_id: respondentSessionId,
        resume_token: resumeTokenPlain,
      },
    });
  } catch (err) {
    console.error('[Interview] POST /:token/start error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/interview/:token/chat
// 응답자 메시지 전송 + Sally 다음 메시지 수신
// Body: { content, client_message_id?, respondent_session_id? }
// ─────────────────────────────────────────────────────────────────
router.post('/:token/chat', async (req, res) => {
  const { token } = req.params;
  const { content, client_message_id, respondent_session_id } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: '메시지를 입력해주세요.' },
    });
  }

  if (!checkChatLimit(token)) {
    return res.status(429).json({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    });
  }

  try {
    const session = await loadSession(token);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '유효하지 않거나 만료된 인터뷰 링크입니다.' },
      });
    }

    if (session.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        error: { code: 'INTERVIEW_CLOSED', message: '이미 종료된 인터뷰입니다.' },
      });
    }

    if (!session.respondent_name) {
      return res.status(400).json({
        success: false,
        error: { code: 'NAME_REQUIRED', message: '먼저 이름을 입력해주세요.' },
      });
    }

    // respondent_session_id 불일치 로깅 (거부하지 않음)
    if (respondent_session_id && session.respondent_session_id &&
        respondent_session_id !== session.respondent_session_id.toString()) {
      console.warn(
        `[Interview] respondent_session_id mismatch: token=${token} ` +
        `expected=${session.respondent_session_id} got=${respondent_session_id}`
      );
    }

    // 멱등 처리: client_message_id 중복 시 기존 어시스턴트 응답 반환
    if (client_message_id) {
      const dup = await query(
        `SELECT t1.turn_index, t2.content AS assistant_content
         FROM interview_turns t1
         LEFT JOIN interview_turns t2
           ON  t2.interview_session_id = t1.interview_session_id
           AND t2.turn_index           = t1.turn_index + 1
           AND t2.role                 = 'assistant'
         WHERE t1.interview_session_id = $1
           AND t1.client_message_id    = $2`,
        [session.id, client_message_id]
      );
      if (dup.rows.length > 0 && dup.rows[0].assistant_content) {
        return res.json({
          success: true,
          data: {
            message: { role: 'assistant', content: dup.rows[0].assistant_content },
            is_completed: session.status === 'completed',
          },
        });
      }
    }

    const state = await getOrCreateState(session.id);

    // ── Transaction 1: 유저 턴 저장 ────────────────────────────────
    // interview_sessions row를 FOR UPDATE로 락 → turn_index 직렬화
    let userTurnId;
    {
      const dbClient = await pool.connect();
      try {
        await dbClient.query('BEGIN');

        await dbClient.query(
          `SELECT lock_version FROM interview_sessions WHERE id = $1 FOR UPDATE`,
          [session.id]
        );

        const { rows: [{ next_index }] } = await dbClient.query(
          `SELECT COALESCE(MAX(turn_index), -1) + 1 AS next_index
           FROM interview_turns WHERE interview_session_id = $1`,
          [session.id]
        );

        const { rows: [userTurn] } = await dbClient.query(
          `INSERT INTO interview_turns
             (interview_session_id, role, content, section, question_index, turn_index, client_message_id)
           VALUES ($1, 'user', $2, $3, $4, $5, $6)
           RETURNING id`,
          [session.id, content.trim(), state.current_section, state.question_index, next_index, client_message_id || null]
        );
        userTurnId = userTurn.id;

        await dbClient.query(
          `UPDATE interview_sessions
           SET lock_version = lock_version + 1, last_activity_at = NOW()
           WHERE id = $1`,
          [session.id]
        );

        await dbClient.query('COMMIT');
      } catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
      } finally {
        dbClient.release();
      }
    }

    // ── AI 응답 생성 (트랜잭션 외부) ───────────────────────────────
    const recentTurns = await loadRecentTurns(session.id, 8);
    const aiResponse = await generateSallyResponse(session, state, recentTurns, content.trim(), false);

    // ── Transaction 2: 어시스턴트 턴 + 상태 업데이트 ───────────────
    let assistantTurnId;
    {
      const dbClient = await pool.connect();
      try {
        await dbClient.query('BEGIN');

        await dbClient.query(
          `SELECT lock_version FROM interview_sessions WHERE id = $1 FOR UPDATE`,
          [session.id]
        );

        const { rows: [{ next_index }] } = await dbClient.query(
          `SELECT COALESCE(MAX(turn_index), -1) + 1 AS next_index
           FROM interview_turns WHERE interview_session_id = $1`,
          [session.id]
        );

        const { rows: [assistantTurn] } = await dbClient.query(
          `INSERT INTO interview_turns
             (interview_session_id, role, content, section, question_index, turn_index)
           VALUES ($1, 'assistant', $2, $3, $4, $5)
           RETURNING id`,
          [session.id, aiResponse.content, aiResponse.section, aiResponse.question_index, next_index]
        );
        assistantTurnId = assistantTurn.id;

        // 상태 진행 + state_version 증가
        await advanceState(dbClient, session.id, state, session.question_list, userTurnId, assistantTurnId);

        if (aiResponse.is_completed) {
          await dbClient.query(
            `UPDATE interview_sessions
             SET status           = 'completed',
                 completed_at     = NOW(),
                 completed_reason = 'normal',
                 lock_version     = lock_version + 1,
                 last_activity_at = NOW()
             WHERE id = $1`,
            [session.id]
          );
          await dbClient.query(
            `INSERT INTO reports (interview_session_id, guest_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [session.id, session.guest_id]
          );
        } else {
          await dbClient.query(
            `UPDATE interview_sessions
             SET lock_version = lock_version + 1, last_activity_at = NOW()
             WHERE id = $1`,
            [session.id]
          );
        }

        await dbClient.query('COMMIT');
      } catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
      } finally {
        dbClient.release();
      }
    }

    return res.json({
      success: true,
      data: {
        message: { role: 'assistant', content: aiResponse.content },
        is_completed: aiResponse.is_completed,
      },
    });
  } catch (err) {
    console.error('[Interview] POST /:token/chat error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Sally가 바빠요. 잠시 후 다시 시도해주세요.' },
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/interview/:token/heartbeat
// 마지막 활동 시간 갱신 (클라이언트 fire-and-forget용)
// ─────────────────────────────────────────────────────────────────
router.post('/:token/heartbeat', async (req, res) => {
  const { token } = req.params;

  try {
    await query(
      `UPDATE interview_sessions
       SET last_activity_at = NOW()
       WHERE link_token = $1
         AND status = 'in_progress'`,
      [token]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[Interview] POST /:token/heartbeat error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
    });
  }
});

export default router;
