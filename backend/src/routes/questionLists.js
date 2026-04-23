import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticateGuest } from '../middleware/authenticateGuest.js';
import { withRLS } from '../models/db.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const router = Router();

// ─────────────────────────────────────────
// GET /api/question-lists/:id
// 질문 리스트 상세 조회
//
// 응답 구조 (프론트 QuestionsPanel 기대값):
//   questions: [
//     { type: 'icebreaker', text, why }
//     { type: 'question', number, text, why, follow_up }
//   ]
// ─────────────────────────────────────────

function stringifyFollowUp(val) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    // 객체인 경우: { text, why, trigger, reaction } 중 text 우선
    if (typeof val === 'object') return val.text || val.trigger || JSON.stringify(val);
    return String(val);
}

router.get('/:id', authenticateGuest, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await withRLS(req.guestId, async (client) => {
            return client.query(
                `SELECT ql.id, ql.version, ql.questions, ql.created_at, ql.title,
    s.session_type, s.input_context
         FROM question_lists ql
         JOIN sessions s ON ql.session_id = s.id
         JOIN projects p ON s.project_id = p.id
         WHERE ql.id = $1
           AND p.guest_id = $2`,
                [id, req.guestId]
            );
        });

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: '질문 리스트를 찾을 수 없습니다.' },
            });
        }

        const row = result.rows[0];
        const raw = row.questions;

        // ── 프론트 기대 구조로 정규화 ──────────────────────────
        // AI가 생성하는 JSON 구조:
        //   { icebreakers: [...], questions: [...] }
        // 프론트가 기대하는 구조:
        //   items: [{ type, number, text, why, follow_up }, ...]
        const normalized = normalizeQuestions(raw);

        return res.json({
            success: true,
            question_list: {
                id: row.id,
                version: row.version,
                session_type: row.session_type,
                created_at: row.created_at,
                title: row.title,
                questions: normalized,
            },
        });
    } catch (err) {
        console.error('[QuestionLists] GET /:id error:', err.message);
        return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '질문 리스트 조회 중 오류가 발생했습니다.' },
        });
    }
});

// ─────────────────────────────────────────
// 정규화 함수
// AI 응답 JSON → 프론트 렌더 구조
// ─────────────────────────────────────────
function normalizeQuestions(raw) {
    const items = [];

    const icebreakers = raw?.icebreakers || [];
    for (let i = 0; i < icebreakers.length; i++) {
        const ice = icebreakers[i];
        const iceHints = ice.follow_up_hint || ice.follow_up;
        items.push({
            type: 'icebreaker',
            number: -(i + 1),
            index: i,
            text: ice.text || ice.question_text || ice.question || '',
            why: ice.why || ice.reason || '',
            text_translated: ice.text_translated || null,
            why_translated:  ice.why_translated  || null,
            follow_up: (Array.isArray(iceHints) ? iceHints : [])
                .map(fq => typeof fq === 'string' ? fq : fq.text || fq.trigger || JSON.stringify(fq)),
        });
    }

    const questions = raw?.questions || [];
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const qHints = q.follow_up_hint || q.follow_up;
        items.push({
            type: 'question',
            number: q.number ?? i + 1,
            index: i,
            hidden: q.hidden || false,
            text: q.text || q.question_text || q.question || '',
            why: q.why || q.reason || '',
            text_translated: q.text_translated || null,
            why_translated:  q.why_translated  || null,
            follow_up: (Array.isArray(qHints) ? qHints : [])
                .map(fq => typeof fq === 'string' ? fq : fq.text || fq.trigger || JSON.stringify(fq)),
        });
    }

    return items;
}

// ─────────────────────────────────────────
// POST /api/question-lists/:id/regenerate/:num
// 개별 질문 AI 수정
// ─────────────────────────────────────────
router.post('/:id/regenerate/:num', authenticateGuest, async (req, res) => {
    const { id, num } = req.params;
    const { instruction } = req.body;

    if (!instruction?.trim()) {
        return res.status(400).json({
            success: false,
            error: { code: 'INVALID_INPUT', message: '수정 지시사항을 입력해주세요.' },
        });
    }

    try {
        const result = await withRLS(req.guestId, async (client) => {
            return client.query(
                `SELECT ql.*, s.input_context, s.session_type
         FROM question_lists ql
         JOIN sessions s ON ql.session_id = s.id
         JOIN projects p ON s.project_id = p.id
         WHERE ql.id = $1 AND p.guest_id = $2`,
                [id, req.guestId]
            );
        });

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: '질문 리스트를 찾을 수 없습니다.' },
            });
        }

        const row = result.rows[0];
        const questions = row.questions;
        const qNum = parseInt(num);

        // 수정할 질문 찾기
        const allItems = [
            ...(questions.icebreakers || []).map(q => ({ ...q, type: 'icebreaker' })),
            ...(questions.questions || []).map(q => ({ ...q, type: 'question' })),
        ];
        const { type, text } = req.body;
        // 디버그
        console.log('[DEBUG] icebreakers in DB:', JSON.stringify(questions.icebreakers?.map(q => ({ text: q.text, question_text: q.question_text })).slice(0, 3)));
        console.log('[DEBUG] 찾는 text:', text?.slice(0, 30));
        let target;
        // 수정
        if (type === 'icebreaker') {
            const iceIndex = Math.abs(qNum) - 1; // -1 → 0, -2 → 1
            target = questions.icebreakers?.[iceIndex];
        } else {
            console.log('[DEBUG] questions 배열 길이:', questions.questions?.length);
            console.log('[DEBUG] questions[0]:', JSON.stringify(questions.questions?.[0])?.slice(0, 50));
            console.log('[DEBUG] qNum:', qNum, 'type:', type);
            target = questions.questions?.[qNum];
            target = target ? { ...target, type: 'question', _isIce: false } : null;
        }

        if (!target) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: '질문을 찾을 수 없습니다.' },
            });
        }

        // AI로 수정 (영어로만 생성)
        const prompt = `Revise the following interview question according to the instruction below.

Original question: "${target.text || target.question_text}"
Revision instruction: "${instruction.trim()}"

Return ONLY valid JSON, no markdown:
{"text": "revised question in English (past-behavior form)", "why": "why this question in English (1-2 sentences, customer development principles)", "revision_reason": "what changed and why (1-2 sentences in English)"}`;

        const response = await anthropic.messages.create({
            model: process.env.AI_MODEL_PRIMARY || 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
        });

        const rawText = response.content[0]?.text || '';
        const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const updated = JSON.parse(cleaned);

        // 번역 (비영어 창업자인 경우)
        const businessSummary = row.input_context?.business_summary || '';
        const isNonEnglish = /[^\x00-\x7F]/.test(businessSummary);
        if (isNonEnglish) {
            try {
                const transResponse = await anthropic.messages.create({
                    model: process.env.AI_MODEL_PRIMARY || 'claude-haiku-4-5-20251001',
                    max_tokens: 1000,
                    system: 'You are a professional translator. Output only valid JSON, no explanation.',
                    messages: [{
                        role: 'user',
                        content: `Translate the following interview question fields to the same language as this business summary:\n${businessSummary}\n\nOutput JSON only:\n{"text_translated": "...", "why_translated": "..."}\n\nFields to translate:\n${JSON.stringify({ text: updated.text || '', why: updated.why || '' })}`,
                    }],
                });
                const rawTrans = transResponse.content[0].text
                    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
                const trans = JSON.parse(rawTrans);
                updated.text_translated = trans.text_translated || null;
                updated.why_translated  = trans.why_translated  || null;
            } catch (transErr) {
                console.error('[QuestionLists] Translation failed (non-fatal):', transErr.message);
            }
        }

        // DB 업데이트
        await withRLS(req.guestId, async (client) => {
            const updatedQuestions = { ...questions };
            if (type === 'icebreaker') {
                const iceIndex = Math.abs(qNum) - 1;
                updatedQuestions.icebreakers = questions.icebreakers.map((q, i) =>
                    i === iceIndex ? { ...q, ...updated } : q
                );
            } else {
                updatedQuestions.questions = questions.questions.map((q, i) =>
                    i === qNum ? { ...q, ...updated } : q
                );
            }
            await client.query(
                `UPDATE question_lists SET questions = $1 WHERE id = $2`,
                [JSON.stringify(updatedQuestions), id]
            );
        });

        return res.json({
            success: true,
            question: { ...updated, number: questions.questions[qNum]?.number ?? qNum + 1 },
        });

    } catch (err) {
        console.error('[QuestionLists] regenerate error:', err.message);
        return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '질문 수정 중 오류가 발생했습니다.' },
        });
    }
});
// ─────────────────────────────────────────
// DELETE /api/question-lists/:id/questions/:num
// 개별 질문 삭제
// ─────────────────────────────────────────
// PATCH /api/question-lists/:id/questions/:num/hide
router.patch('/:id/questions/:num/hide', authenticateGuest, async (req, res) => {
    const { id, num } = req.params;
    const { hidden } = req.body;  // ← 추가: 명시적 값 받기
    const qNum = parseInt(num);

    try {
        const result = await withRLS(req.guestId, async (client) => {
            return client.query(
                `SELECT ql.* FROM question_lists ql
         JOIN sessions s ON ql.session_id = s.id
         JOIN projects p ON s.project_id = p.id
         WHERE ql.id = $1 AND p.guest_id = $2`,
                [id, req.guestId]
            );
        });

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: '질문 리스트를 찾을 수 없습니다.' },
            });
        }

        const questions = result.rows[0].questions;
        console.log('[HIDE_DEBUG] DB questions[0]:', JSON.stringify(questions.questions?.[0]));
        console.log('[HIDE_DEBUG] DB questions[1]:', JSON.stringify(questions.questions?.[1]));
        console.log('[HIDE_DEBUG] qNum(index):', qNum);
        const updatedQuestions = { ...questions };

        if (qNum < 0) {
            const iceIndex = Math.abs(qNum) - 1;
            updatedQuestions.icebreakers = questions.icebreakers.map((q, i) =>
                i === iceIndex ? { ...q, hidden: !q.hidden } : q
            );
        } else {
            updatedQuestions.questions = questions.questions.map((q, i) =>
                i === qNum ? { ...q, hidden: hidden } : q  // ← toggle 아닌 명시적 값
            );
        }

        await withRLS(req.guestId, async (client) => {
            await client.query(
                `UPDATE question_lists SET questions = $1 WHERE id = $2`,
                [JSON.stringify(updatedQuestions), id]
            );
        });

        const normalized = normalizeQuestions(updatedQuestions);
        return res.json({ success: true, questions: normalized });

    } catch (err) {
        console.error('[QuestionLists] hide error:', err.message);
        return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '질문 숨기기 중 오류가 발생했습니다.' },
        });
    }
});


// ─────────────────────────────────────────
// PATCH /api/question-lists/:id/favorite
// 즐겨찾기 토글
// ─────────────────────────────────────────
router.patch('/:id/favorite', authenticateGuest, async (req, res) => {
    const { id } = req.params;
    try {
        await withRLS(req.guestId, async (client) => {
            await client.query(
                `UPDATE question_lists SET is_favorite = NOT is_favorite
     WHERE id = $1
     AND session_id IN (
         SELECT s.id FROM sessions s
         JOIN projects p ON s.project_id = p.id
         WHERE p.guest_id = $2
     )`,
                [id, req.guestId]
            );
        });
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false });
    }
});

// ─────────────────────────────────────────
// PATCH /api/question-lists/:id/title
// 제목 수정
// ─────────────────────────────────────────
router.patch('/:id/title', authenticateGuest, async (req, res) => {
    const { id } = req.params;
    const { title } = req.body;
    try {
        await withRLS(req.guestId, async (client) => {
            await client.query(
                `UPDATE question_lists SET title = $1
     WHERE id = $2
     AND session_id IN (
         SELECT s.id FROM sessions s
         JOIN projects p ON s.project_id = p.id
         WHERE p.guest_id = $3
     )`,
                [title, id, req.guestId]
            );
        });
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false });
    }
});

// ─────────────────────────────────────────
// DELETE /api/question-lists/:id
// 삭제
// ─────────────────────────────────────────
router.delete('/:id', authenticateGuest, async (req, res) => {
    const { id } = req.params;
    try {
        await withRLS(req.guestId, async (client) => {
            await client.query(
                `DELETE FROM question_lists
     WHERE id = $1
     AND session_id IN (
         SELECT s.id FROM sessions s
         JOIN projects p ON s.project_id = p.id
         WHERE p.guest_id = $2
     )`,
                [id, req.guestId]
            );
        });
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false });
    }
});

export default router;
