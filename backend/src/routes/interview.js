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

// ─────────────────────────────────────────────────────────────────
// 섹션 설정
// ─────────────────────────────────────────────────────────────────
const SECTION_ORDER = ['icebreaker', 'context', 'problems', 'alternatives', 'wtp'];

const SECTION_CONFIG = {
  icebreaker:   { minTurns: 2, maxFollowups: 0, hard_max_turns: 4  },
  context:      { minTurns: 2, maxFollowups: 1, hard_max_turns: 5  },
  problems:     { minTurns: 2, maxFollowups: 1, hard_max_turns: 7  },
  alternatives: { minTurns: 2, maxFollowups: 1, hard_max_turns: 5  },
  wtp:          { minTurns: 2, maxFollowups: 1, hard_max_turns: 5  },
};

const SECTION_GOALS = {
  icebreaker:
    "Build rapport. Learn about the respondent's role, background, and how they relate to the problem space. Keep it light and conversational.",
  context:
    'Understand their current situation and workflow around the problem. Learn what they do today, how often, and with what tools or processes.',
  problems:
    'Identify their biggest pain points in detail. Probe for specifics: what exactly fails, how often it happens, and what the cost or impact is.',
  alternatives:
    "Understand what solutions they currently use or have tried. What do they like? What frustrates them most about current alternatives?",
  wtp:
    "Explore whether they would pay for a better solution. What would need to be true? What budget range feels right? Do NOT anchor with a price — let them speak first.",
  wrap_up:
    'Wrap up the interview warmly. Thank them sincerely. You may close with one open question: "Is there anything else you\'d like to share that we haven\'t covered?"',
};

// ─────────────────────────────────────────────────────────────────
// Rate limit (토큰 기반, 메모리)
// ─────────────────────────────────────────────────────────────────
const chatLimitMap = new Map();
const checkChatLimit = (token) => {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${token}_${today}`;
  const count = chatLimitMap.get(key) || 0;
  if (count >= 100) return false;
  chatLimitMap.set(key, count + 1);
  return true;
};

// ─────────────────────────────────────────────────────────────────
// DB 헬퍼
// ─────────────────────────────────────────────────────────────────
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
       s.input_context,
       s.session_type
     FROM interview_sessions is2
     JOIN question_lists ql ON is2.question_list_id = ql.id
     JOIN sessions s ON ql.session_id = s.id
     WHERE is2.link_token = $1
       AND is2.expires_at > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

// 전체 대화 (디스플레이용, ASC)
async function loadAllTurns(interviewSessionId, limit = 50) {
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

// 최근 N턴 (Claude context용, ASC 정렬 반환)
async function loadRecentTurnsForContext(interviewSessionId, limit = 6) {
  const result = await query(
    `SELECT role, content, section, turn_index
     FROM (
       SELECT role, content, section, turn_index
       FROM interview_turns
       WHERE interview_session_id = $1
       ORDER BY turn_index DESC
       LIMIT $2
     ) t
     ORDER BY turn_index ASC`,
    [interviewSessionId, limit]
  );
  return result.rows;
}

async function getOrCreateState(interviewSessionId) {
  const existing = await query(
    `SELECT * FROM interview_state WHERE interview_session_id = $1`,
    [interviewSessionId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await query(
    `INSERT INTO interview_state (interview_session_id) VALUES ($1) RETURNING *`,
    [interviewSessionId]
  );
  return created.rows[0];
}

// 섹션 완료 요약: 해당 섹션의 최근 user 답변 2개를 key_points로 저장
async function buildSectionSummary(interviewSessionId, section) {
  const result = await query(
    `SELECT content FROM interview_turns
     WHERE interview_session_id = $1 AND role = 'user' AND section = $2
     ORDER BY turn_index DESC
     LIMIT 2`,
    [interviewSessionId, section]
  );
  const keyPoints = result.rows.reverse().map((r) =>
    r.content.length > 150 ? r.content.substring(0, 150) + '…' : r.content
  );
  return { section, key_points: keyPoints };
}

// ─────────────────────────────────────────────────────────────────
// 섹션별 topics 추출 헬퍼
// section 태그 있으면 필터링, 없으면 전체 반환 (구버전 호환)
// ─────────────────────────────────────────────────────────────────
function getSectionTopics(questionList, section) {
  const all = [
    ...(questionList.icebreakers || []),
    ...(questionList.questions   || []),
  ];
  const filtered = all.filter((q) => q.section === section);
  if (filtered.length > 0) return filtered;
  console.warn(`[Interview] No topics found for section=${section}, using all`);
  return all;
}

// ─────────────────────────────────────────────────────────────────
// 프롬프트 조립
// ─────────────────────────────────────────────────────────────────
function buildSystemPrompt({ section, businessContext, keyTopics, completedSections, followupCount, maxFollowups, sessionType, questionIndex = 0, totalQuestions = 0 }) {
  const prevText =
    completedSections.length > 0
      ? completedSections
          .map((s) => `[${s.section.toUpperCase()}]\n${s.key_points.map((p) => `  - ${p}`).join('\n')}`)
          .join('\n\n')
      : 'No previous sections completed yet.';

  const topicsText = (() => {
    if (keyTopics.length === 0) return '  (No specific topics — use your judgment based on the business context.)';
    const currentQ = keyTopics[questionIndex] || keyTopics[0];
    const hints = currentQ.follow_up_hint?.length
      ? '\n' + currentQ.follow_up_hint.slice(0, 2)
          .map((h, hi) => `  ${hi === 0 ? '→ If short answer, probe:' : '→ Or dig deeper:'} ${h}`)
          .join('\n')
      : '';
    const currentBlock = `[CURRENT QUESTION — Ask this now]\nQ${questionIndex + 1} of ${totalQuestions}: ${currentQ.text || String(currentQ)}${hints}`;
    const remaining = keyTopics.slice(questionIndex + 1);
    const remainingBlock = remaining.length > 0
      ? '\n\n[REMAINING QUESTIONS — Cover these next, in order]\n' +
        remaining.map((q, i) => {
          const text = q.text || String(q);
          return `Q${questionIndex + 2 + i}: ${text.length > 60 ? text.slice(0, 57) + '...' : text}`;
        }).join('\n')
      : '';
    return currentBlock + remainingBlock;
  })();

  const SECTION_COMPLETION_CRITERIA = {
    icebreaker: `Set section_complete_candidate=true when:
- You have asked at least 2 questions AND received answers
- The respondent has described their role or situation
- The conversation feels naturally warmed up
Do NOT keep this section going unnecessarily. If the above conditions are mostly met, set true.`,
    context: `Set section_complete_candidate=true when:
- You understand their current workflow or situation
- You know what tools or methods they currently use
- At least 2 substantive answers received`,
    problems: `Set section_complete_candidate=true when:
- You have asked the current guide question (Q${questionIndex + 1} of ${totalQuestions}) and received a substantive answer
- This is the last question in the section, OR answers are becoming repetitive
- Guide questions are exhausted — do NOT keep asking if all are covered`,
    alternatives: `Set section_complete_candidate=true when:
- You know what solutions they currently use
- You have some sense of their dissatisfaction`,
    wtp: `Set section_complete_candidate=true when:
- You have explored willingness to pay
- You have some sense of budget or conditions`,
  };

  const session1Rules = sessionType === 1 ? `
[SESSION 1 RULES — CRITICAL, NO EXCEPTIONS]
- NEVER mention solutions, products, or tools you could build
- NEVER ask about pricing, value, or willingness to pay
- NEVER ask "If you had a tool that..." or "What would it be worth..."
- NEVER ask hypothetical future questions ("What if...", "Would you...")
- Session 1 ends after the alternatives section — there is NO wtp section
` : '';

  return `[ROLE]
You are Sally, an expert customer development interviewer working on behalf of a non-native English founder.
The respondent is a potential customer. Listen carefully and ask one thoughtful question at a time.

[BUSINESS CONTEXT]
${businessContext}

[INTERVIEW GUIDE]
${topicsText}

- Ask the CURRENT QUESTION now. Do not skip ahead or invent new questions.
- Use follow-up probes only if the answer is too short or vague (max 1 follow-up per question).
- Once the current question is answered, move to the next in the list.
DO NOT revisit topics already covered. DO NOT invent questions outside this guide.

[CURRENT SECTION: ${section.toUpperCase()}]
Goal: ${SECTION_GOALS[section] || ''}
${session1Rules}
[RULES]
- Ask exactly ONE question per response
- Use natural, simple conversational English
- Never mention section names, interview structure, or transitions to the respondent
- Do not repeat topics already covered in previous sections
- Briefly acknowledge the respondent's last answer before your question (1 short sentence max)
- Avoid hollow affirmations: no "Great!", "Interesting!", "Awesome!" — use genuine acknowledgment or nothing
- If this is a follow-up, dig deeper into what they just said; do not change topic
- NEVER ask a question semantically similar to one already asked in this section
- Maximum 1 follow-up per guide question — after the follow-up, move to the next guide question
- If the guide question has been sufficiently answered, move on even if you could probe further

[PREVIOUS SECTIONS — KEY FINDINGS]
${prevText}

[CURRENT STATE]
Current question: Q${questionIndex + 1} of ${totalQuestions}
Follow-ups used on current question: ${followupCount}/${maxFollowups}

[SECTION COMPLETION CRITERIA]
${SECTION_COMPLETION_CRITERIA[section] || 'Set section_complete_candidate=true when the section goals are sufficiently met.'}

IMPORTANT: Do not always return section_complete_candidate=false.
If the section goals are mostly met, return true. It is better to move forward than to repeat questions.

[FOLLOW-UP CRITERIA]
Set needs_followup=true ONLY when:
- Answer is very short (under 10 words)
- Answer is too vague to understand their situation
- A critical detail is completely missing
Otherwise set needs_followup=false.

[OUTPUT — RESPOND WITH JSON ONLY, NO OTHER TEXT]
{
  "next_question": "The exact English question to send to the respondent",
  "needs_followup": false,
  "followup_reason": "",
  "section_complete_candidate": false,
  "section_completion_reason": ""
}`;
}

// ─────────────────────────────────────────────────────────────────
// Claude API 호출 + JSON 파싱 (최대 1회 재시도)
// ─────────────────────────────────────────────────────────────────
async function callClaudeForTurn(systemPrompt, recentTurns, retryCount = 0) {
  // Claude messages 배열: user 턴으로 시작해야 함
  let messages = recentTurns.map((t) => ({ role: t.role, content: t.content }));
  while (messages.length > 0 && messages[0].role === 'assistant') {
    messages = messages.slice(1);
  }
  if (messages.length === 0) {
    messages = [{ role: 'user', content: 'Please begin.' }];
  }

  try {
    const response = await anthropic.messages.create({
      model: process.env.AI_PRIMARY_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: parseInt(process.env.AI_MAX_TOKENS_INTERVIEW) || 700,
      system: systemPrompt,
      messages,
    });

    const rawText = response.content[0].text;
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!parsed.next_question || typeof parsed.next_question !== 'string') {
      throw new Error('Invalid JSON: missing next_question');
    }

    return {
      next_question:             parsed.next_question.trim(),
      needs_followup:            Boolean(parsed.needs_followup),
      followup_reason:           String(parsed.followup_reason || ''),
      section_complete_candidate: Boolean(parsed.section_complete_candidate),
      section_completion_reason: String(parsed.section_completion_reason || ''),
    };
  } catch (err) {
    if (retryCount < 1) {
      console.warn('[Interview] Claude JSON parse failed, retrying:', err.message);
      return callClaudeForTurn(systemPrompt, recentTurns, retryCount + 1);
    }
    console.error('[Interview] Claude failed after retry:', err.message);
    return {
      next_question:             'Could you tell me a bit more about that?',
      needs_followup:            true,
      followup_reason:           'api_error',
      section_complete_candidate: false,
      section_completion_reason: '',
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// 서버 의사결정 (Claude 힌트 참조하되 서버가 최종 결정)
// ─────────────────────────────────────────────────────────────────
function makeServerDecision(state, claudeResult, wordCount, sessionType, totalQuestions) {
  const section = state.current_section;
  const config = SECTION_CONFIG[section];

  if (!config) return { action: 'wrap_up' };

  const orderedSections = sessionType === 1
    ? SECTION_ORDER.filter((s) => s !== 'wtp')
    : SECTION_ORDER;

  // 이번 턴 포함한 섹션 내 누적 user 턴 수
  const candidateTurnCount = (state.section_turn_count || 0) + 1;
  const forceFollowup = wordCount < 15;
  const followupCount = state.followup_count || 0;
  const canFollowup = followupCount < config.maxFollowups;

  // hard_max_turns 초과 → 강제 섹션 전환
  const hardForce = candidateTurnCount >= config.hard_max_turns;
  if (hardForce) {
    console.log(`[Interview] hard_max_turns(${config.hard_max_turns}) reached in section=${section}, forcing transition`);
    const currentIdx = orderedSections.indexOf(section);
    const nextSection = orderedSections[currentIdx + 1];
    return nextSection ? { action: 'transition', nextSection } : { action: 'wrap_up' };
  }

  // 1순위: followup (짧은 답변 강제 or Claude 판단)
  if ((forceFollowup || claudeResult.needs_followup) && canFollowup) {
    return { action: 'followup' };
  }

  // 2순위: maxFollowups 소진 → 다음 질문으로 강제 이동 (Claude 판단 무시)
  if (followupCount >= config.maxFollowups) {
    const nextQuestionIdx = (state.question_index || 0) + 1;
    if (nextQuestionIdx >= totalQuestions) {
      // 마지막 질문까지 소진 → 섹션 전환
      const currentIdx = orderedSections.indexOf(section);
      const nextSection = orderedSections[currentIdx + 1];
      return nextSection ? { action: 'transition', nextSection } : { action: 'wrap_up' };
    }
    return { action: 'next_question', questionIndex: nextQuestionIdx };
  }

  // 3순위: soft transition (Claude 완료 신호)
  const softTransition =
    candidateTurnCount >= config.minTurns &&
    claudeResult.section_complete_candidate;

  if (softTransition) {
    const currentIdx = orderedSections.indexOf(section);
    const nextSection = orderedSections[currentIdx + 1];
    return nextSection ? { action: 'transition', nextSection } : { action: 'wrap_up' };
  }

  // 4순위: 섹션 내 계속
  return { action: 'continue' };
}

// ─────────────────────────────────────────────────────────────────
// wrap_up 메시지 생성 (plain text)
// ─────────────────────────────────────────────────────────────────
async function generateWrapUpMessage(respondentName, businessContext) {
  try {
    const response = await anthropic.messages.create({
      model: process.env.AI_PRIMARY_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `You are Sally, a warm AI interviewer wrapping up a customer development interview.
Write 2-3 sentences: thank the respondent sincerely, then optionally ask if there's anything else to share.
Be genuine and conversational. No bullet points or lists.`,
      messages: [{
        role: 'user',
        content: `Respondent's name: ${respondentName}\nBusiness context: ${businessContext}\n\nWrite the closing message.`,
      }],
    });
    return response.content[0].text;
  } catch (err) {
    console.error('[Interview] generateWrapUpMessage failed:', err.message);
    return `Thank you so much, ${respondentName}! This has been really helpful. We really appreciate you taking the time to share your thoughts with us.`;
  }
}

// ─────────────────────────────────────────────────────────────────
// 리포트 비동기 생성 (fire-and-forget)
// ─────────────────────────────────────────────────────────────────
async function generateReport(interviewSessionId, businessContext) {
  try {
    await query(
      `UPDATE reports SET status = 'generating' WHERE interview_session_id = $1`,
      [interviewSessionId]
    );

    const turns = await query(
      `SELECT role, content, section FROM interview_turns
       WHERE interview_session_id = $1
       ORDER BY turn_index ASC`,
      [interviewSessionId]
    );

    const transcript = turns.rows
      .map((t) => `${t.role === 'assistant' ? 'Sally' : 'Respondent'} [${t.section}]: ${t.content}`)
      .join('\n\n');

    const systemPrompt = `You are an expert customer development analyst.
Analyze this interview transcript and produce a structured report.
Output ONLY valid JSON matching this exact schema — no other text:
{
  "hypothesis_verdict": "confirmed" | "mixed" | "rejected",
  "top_pains": [{"title": "", "quote": "", "frequency": ""}],
  "current_alternatives": [{"tool": "", "complaint": ""}],
  "wtp_summary": "",
  "next_actions": ["", "", ""],
  "next_questions": ["", "", ""]
}
Rules:
- hypothesis_verdict: "confirmed" if problem clearly exists and is painful, "rejected" if not, "mixed" otherwise
- top_pains: max 3, ranked by severity. quote = exact words from respondent
- current_alternatives: max 3 tools/methods they currently use
- wtp_summary: 1-2 sentences summarizing willingness-to-pay signals
- next_actions: 3 concrete things the founder should do next week
- next_questions: 3 questions to ask in the next customer interview`;

    let result = null;
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await anthropic.messages.create({
          model: process.env.AI_MODEL_FALLBACK || 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Business context: ${businessContext}\n\nInterview transcript:\n${transcript}`,
          }],
        });

        const rawText = response.content[0].text;
        const cleaned = rawText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        result = JSON.parse(cleaned);
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[Report] Attempt ${attempt + 1} failed:`, err.message);
      }
    }

    if (result) {
      await query(
        `UPDATE reports SET status = 'completed', result = $1, completed_at = NOW()
         WHERE interview_session_id = $2`,
        [JSON.stringify(result), interviewSessionId]
      );
      console.log(`[Report] Generated successfully for session ${interviewSessionId}`);
    } else {
      await query(
        `UPDATE reports SET status = 'failed' WHERE interview_session_id = $1`,
        [interviewSessionId]
      );
      console.error(`[Report] Failed after 3 attempts for ${interviewSessionId}:`, lastError?.message);
    }
  } catch (err) {
    console.error(`[Report] Unexpected error for ${interviewSessionId}:`, err.message);
    await query(
      `UPDATE reports SET status = 'failed' WHERE interview_session_id = $1`,
      [interviewSessionId]
    ).catch(() => {});
  }
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

    const turns = await loadAllTurns(session.id, 50);

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
// 재접속: completed_sections 요약 + 최근 6턴 반환
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
    const existingTurnCount = isReconnect
      ? (await query(
          `SELECT COUNT(*) AS cnt FROM interview_turns WHERE interview_session_id = $1`,
          [session.id]
        )).rows[0].cnt
      : 0;

    // 재접속: 기존 대화 있음 → completed_sections 요약 + 최근 6턴 반환
    if (isReconnect && parseInt(existingTurnCount) > 0) {
      const state = await getOrCreateState(session.id);
      const recentTurns = await loadRecentTurnsForContext(session.id, 6);

      return res.json({
        success: true,
        data: {
          turns: recentTurns,
          is_completed: session.status === 'completed',
          respondent_session_id: session.respondent_session_id,
          resume_token: null,
          // 재접속 컨텍스트: 프론트에서 "이전 대화를 이어갑니다" 표시용
          reconnect_context: {
            current_section: state.current_section,
            completed_sections: Array.isArray(state.completed_sections) ? state.completed_sections : [],
          },
        },
      });
    }

    // 최초 시작
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
      await query(
        `UPDATE interview_sessions SET respondent_name = $1, last_activity_at = NOW() WHERE id = $2`,
        [name.trim(), session.id]
      );
    }
    session.respondent_name = name.trim();

    await getOrCreateState(session.id);

    // icebreaker 첫 인사 생성
    const businessContext = session.input_context?.business_summary || '';

    const icebreakerTopics = getSectionTopics(session.question_list, 'icebreaker');
    const greetingPrompt = buildSystemPrompt({
      section:          'icebreaker',
      businessContext,
      keyTopics:        icebreakerTopics,
      completedSections: [],
      followupCount:    0,
      maxFollowups:     SECTION_CONFIG.icebreaker.maxFollowups,
      sessionType:      session.session_type,
      questionIndex:    0,
      totalQuestions:   icebreakerTopics.length,
    });

    let greetingText = `Hi ${session.respondent_name}! Great to meet you. Could you start by telling me a bit about yourself and what you do?`;

    try {
      const greetingResponse = await anthropic.messages.create({
        model:      process.env.AI_PRIMARY_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: parseInt(process.env.AI_MAX_TOKENS_INTERVIEW) || 700,
        system:     greetingPrompt,
        messages: [{
          role:    'user',
          content: `Start the interview. The respondent's name is ${session.respondent_name}.
Write a warm 1-sentence greeting then naturally ask your first question — combined into one message.
Respond in JSON: {"next_question": "greeting + first question", "needs_followup": false, "followup_reason": "", "section_complete_candidate": false, "section_completion_reason": ""}`,
        }],
      });

      const rawText = greetingResponse.content[0].text;
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.next_question) greetingText = parsed.next_question;
    } catch (err) {
      console.warn('[Interview] Greeting generation failed, using fallback:', err.message);
    }

    await query(
      `INSERT INTO interview_turns
         (interview_session_id, role, content, section, question_index, turn_index)
       VALUES ($1, 'assistant', $2, 'icebreaker', 0, 0)`,
      [session.id, greetingText]
    );

    return res.json({
      success: true,
      data: {
        turns: [{ role: 'assistant', content: greetingText }],
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

    if (respondent_session_id && session.respondent_session_id &&
        respondent_session_id !== session.respondent_session_id.toString()) {
      console.warn(
        `[Interview] respondent_session_id mismatch: token=${token} ` +
        `expected=${session.respondent_session_id} got=${respondent_session_id}`
      );
    }

    // 멱등 처리: client_message_id 중복 시 기존 응답 반환
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
    const userAnswer = content.trim();
    const wordCount = userAnswer.split(/\s+/).filter(Boolean).length;

    // no_response 처리 (단독 단어 1개 이하 or 2자 미만)
    if (wordCount <= 1 && userAnswer.length < 3) {
      const newCount = (state.no_response_count || 0) + 1;
      await query(
        `UPDATE interview_state SET no_response_count = $1, updated_at = NOW()
         WHERE interview_session_id = $2`,
        [newCount, session.id]
      );
      if (newCount >= 3) {
        await query(
          `UPDATE interview_sessions
           SET status = 'abandoned', abandoned_at = NOW(), last_activity_at = NOW()
           WHERE id = $1`,
          [session.id]
        );
        return res.json({
          success: true,
          data: {
            message: {
              role: 'assistant',
              content: "It seems like you're having trouble responding right now. Feel free to come back anytime — the link will still be active.",
            },
            is_completed: false,
            abandoned: true,
          },
        });
      }
    }

    // ── Transaction 1: user turn 저장 ──────────────────────────────
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
          [session.id, userAnswer, state.current_section, state.question_index, next_index, client_message_id || null]
        );
        userTurnId = userTurn.id;

        await dbClient.query(
          `UPDATE interview_sessions SET lock_version = lock_version + 1, last_activity_at = NOW() WHERE id = $1`,
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

    // ── AI 결정 + 응답 생성 (트랜잭션 외부) ────────────────────────
    const businessContext = session.input_context?.business_summary || '';
    const completedSections = Array.isArray(state.completed_sections)
      ? state.completed_sections
      : [];

    // 응답자가 종료 의사를 명확히 밝힌 경우 → 즉시 wrap_up
    const userWantsStop = /^(stop|quit|end|exit|bye|goodbye|done|finish)\.?$/i.test(userAnswer);

    let assistantText;
    let finalSection = state.current_section;
    let isCompleted = false;
    let decision;
    let sectionSummaryForTransition = null; // transition 시 한 번만 조회

    if (userWantsStop || state.current_section === 'wrap_up') {
      decision = { action: 'wrap_up' };
      assistantText = await generateWrapUpMessage(session.respondent_name, businessContext);
      finalSection = 'wrap_up';
      isCompleted = true;

    } else {
      // 1. 현재 섹션 context로 Claude 호출
      const currentSectionTopics = getSectionTopics(session.question_list, state.current_section);
      const systemPrompt = buildSystemPrompt({
        section:          state.current_section,
        businessContext,
        keyTopics:        currentSectionTopics,
        completedSections,
        followupCount:    state.followup_count || 0,
        maxFollowups:     SECTION_CONFIG[state.current_section]?.maxFollowups ?? 0,
        sessionType:      session.session_type,
        questionIndex:    state.question_index || 0,
        totalQuestions:   currentSectionTopics.length,
      });

      // user turn 저장 후 context 로드 (현재 user 턴 포함)
      const recentTurns = await loadRecentTurnsForContext(session.id, 6);
      const claudeResult = await callClaudeForTurn(systemPrompt, recentTurns);

      // 2. 서버 최종 결정
      decision = makeServerDecision(state, claudeResult, wordCount, session.session_type, currentSectionTopics.length);

      if (decision.action === 'transition') {
        // 전환: 현재 섹션 요약 생성 후 새 섹션 opening 질문 요청
        sectionSummaryForTransition = await buildSectionSummary(session.id, state.current_section);
        const updatedCompletedSections = [...completedSections, sectionSummaryForTransition];

        const nextSectionTopics = getSectionTopics(session.question_list, decision.nextSection);
        const nextSystemPrompt = buildSystemPrompt({
          section:           decision.nextSection,
          businessContext,
          keyTopics:         nextSectionTopics,
          completedSections: updatedCompletedSections,
          followupCount:     0,
          maxFollowups:      SECTION_CONFIG[decision.nextSection]?.maxFollowups ?? 0,
          sessionType:       session.session_type,
          questionIndex:     0,
          totalQuestions:    nextSectionTopics.length,
        });

        const nextResult = await callClaudeForTurn(nextSystemPrompt, recentTurns);
        assistantText = nextResult.next_question;
        finalSection = decision.nextSection;

      } else if (decision.action === 'next_question') {
        // followup 소진 → 다음 질문으로 강제 이동 (Claude 재호출)
        const nextQTopics = getSectionTopics(session.question_list, state.current_section);
        const nextQPrompt = buildSystemPrompt({
          section:        state.current_section,
          businessContext,
          keyTopics:      nextQTopics,
          completedSections,
          followupCount:  0,
          maxFollowups:   SECTION_CONFIG[state.current_section]?.maxFollowups ?? 0,
          sessionType:    session.session_type,
          questionIndex:  decision.questionIndex,
          totalQuestions: nextQTopics.length,
        });
        const nextQResult = await callClaudeForTurn(nextQPrompt, recentTurns);
        assistantText = nextQResult.next_question;
        finalSection = state.current_section;

      } else if (decision.action === 'wrap_up') {
        assistantText = await generateWrapUpMessage(session.respondent_name, businessContext);
        finalSection = 'wrap_up';
        isCompleted = true;

      } else {
        // followup or continue: Claude가 생성한 next_question 사용
        assistantText = claudeResult.next_question;
        finalSection = state.current_section;
      }
    }

    // ── Transaction 2: assistant turn + state 업데이트 ──────────────
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
          [session.id, assistantText, finalSection, state.question_index, next_index]
        );
        assistantTurnId = assistantTurn.id;

        // 섹션별 state 업데이트
        const candidateTurnCount = (state.section_turn_count || 0) + 1;

        if (decision.action === 'followup') {
          await dbClient.query(
            `UPDATE interview_state
             SET followup_count         = followup_count + 1,
                 section_turn_count     = $1,
                 last_user_turn_id      = $2,
                 last_assistant_turn_id = $3,
                 state_version          = state_version + 1,
                 updated_at             = NOW()
             WHERE interview_session_id = $4`,
            [candidateTurnCount, userTurnId, assistantTurnId, session.id]
          );

        } else if (decision.action === 'continue') {
          await dbClient.query(
            `UPDATE interview_state
             SET question_index         = question_index + 1,
                 section_turn_count     = $1,
                 followup_count         = 0,
                 last_user_turn_id      = $2,
                 last_assistant_turn_id = $3,
                 state_version          = state_version + 1,
                 updated_at             = NOW()
             WHERE interview_session_id = $4`,
            [candidateTurnCount, userTurnId, assistantTurnId, session.id]
          );

        } else if (decision.action === 'next_question') {
          await dbClient.query(
            `UPDATE interview_state
             SET question_index         = $1,
                 section_turn_count     = $2,
                 followup_count         = 0,
                 last_user_turn_id      = $3,
                 last_assistant_turn_id = $4,
                 state_version          = state_version + 1,
                 updated_at             = NOW()
             WHERE interview_session_id = $5`,
            [decision.questionIndex, candidateTurnCount, userTurnId, assistantTurnId, session.id]
          );

        } else if (decision.action === 'transition') {
          // sectionSummaryForTransition은 AI 단계에서 이미 조회함
          await dbClient.query(
            `UPDATE interview_state
             SET current_section        = $1,
                 question_index         = 0,
                 section_turn_count     = 0,
                 followup_count         = 0,
                 completed_sections     = completed_sections || $2::jsonb,
                 transition_reason      = 'section_complete',
                 last_user_turn_id      = $3,
                 last_assistant_turn_id = $4,
                 state_version          = state_version + 1,
                 updated_at             = NOW()
             WHERE interview_session_id = $5`,
            [decision.nextSection, JSON.stringify(sectionSummaryForTransition), userTurnId, assistantTurnId, session.id]
          );

        } else {
          // wrap_up
          await dbClient.query(
            `UPDATE interview_state
             SET current_section        = 'wrap_up',
                 section_turn_count     = $1,
                 transition_reason      = 'interview_complete',
                 last_user_turn_id      = $2,
                 last_assistant_turn_id = $3,
                 state_version          = state_version + 1,
                 updated_at             = NOW()
             WHERE interview_session_id = $4`,
            [candidateTurnCount, userTurnId, assistantTurnId, session.id]
          );
        }

        if (isCompleted) {
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
            `UPDATE interview_sessions SET lock_version = lock_version + 1, last_activity_at = NOW() WHERE id = $1`,
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

    // 리포트 비동기 생성 (completed 후 fire-and-forget)
    if (isCompleted) {
      generateReport(session.id, businessContext).catch((err) =>
        console.error('[Interview] generateReport fire-and-forget error:', err.message)
      );
    }

    return res.json({
      success: true,
      data: {
        message: { role: 'assistant', content: assistantText },
        is_completed: isCompleted,
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
// ─────────────────────────────────────────────────────────────────
router.post('/:token/heartbeat', async (req, res) => {
  const { token } = req.params;

  try {
    await query(
      `UPDATE interview_sessions SET last_activity_at = NOW()
       WHERE link_token = $1 AND status = 'in_progress'`,
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
