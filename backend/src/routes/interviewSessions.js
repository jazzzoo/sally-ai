// backend/src/routes/interviewSessions.js
// 창업자용 인터뷰 링크 관리 API (인증 필요)
//
// POST /api/interview-sessions         — 인터뷰 링크 생성
// GET  /api/interview-sessions         — 내 링크 목록 조회
// DELETE /api/interview-sessions/:id   — 링크 비활성화

import { Router } from 'express';
import { randomBytes } from 'crypto';
import { authenticateGuest } from '../middleware/authenticateGuest.js';
import { withRLS, query } from '../models/db.js';

const router = Router();

// ── 링크 토큰 생성 (12자 hex) ──────────────────────────────────
function generateLinkToken() {
  return randomBytes(6).toString('hex'); // e.g. "a3f9c2b1e807"
}

// ─────────────────────────────────────────────────────────────────
// POST /api/interview-sessions
// 질문 리스트로부터 인터뷰 링크 생성
// Body: { question_list_id }
// ─────────────────────────────────────────────────────────────────
router.post('/', authenticateGuest, async (req, res) => {
  const { question_list_id } = req.body;

  if (!question_list_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'question_list_id가 필요합니다.' },
    });
  }

  try {
    // question_list가 현재 guest 소유인지 확인
    const ownership = await withRLS(req.guestId, async (client) => {
      return client.query(
        `SELECT ql.id
         FROM question_lists ql
         JOIN sessions s ON ql.session_id = s.id
         JOIN projects p ON s.project_id = p.id
         WHERE ql.id = $1 AND p.guest_id = $2`,
        [question_list_id, req.guestId]
      );
    });

    if (ownership.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '질문 리스트를 찾을 수 없습니다.' },
      });
    }

    // 링크 생성 (충돌 시 재시도)
    let link_token;
    let attempts = 0;
    while (attempts < 5) {
      link_token = generateLinkToken();
      const exists = await query(
        'SELECT id FROM interview_sessions WHERE link_token = $1',
        [link_token]
      );
      if (exists.rows.length === 0) break;
      attempts++;
    }

    const result = await withRLS(req.guestId, async (client) => {
      return client.query(
        `INSERT INTO interview_sessions (question_list_id, guest_id, link_token)
         VALUES ($1, $2, $3)
         RETURNING id, link_token, status, created_at, expires_at`,
        [question_list_id, req.guestId, link_token]
      );
    });

    const session = result.rows[0];
    const appUrl = process.env.APP_URL || 'https://nitor8.vercel.app';

    return res.status(201).json({
      success: true,
      data: {
        id: session.id,
        link_token: session.link_token,
        url: `${appUrl}/interview/${session.link_token}`,
        status: session.status,
        created_at: session.created_at,
        expires_at: session.expires_at,
      },
    });
  } catch (err) {
    console.error('[InterviewSessions] POST / error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '링크 생성 중 오류가 발생했습니다.' },
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/interview-sessions
// 내 인터뷰 링크 목록 조회 (question_list_id 필터 가능)
// Query: ?question_list_id=...
// ─────────────────────────────────────────────────────────────────
router.get('/', authenticateGuest, async (req, res) => {
  const { question_list_id } = req.query;

  try {
    const result = await withRLS(req.guestId, async (client) => {
      const params = [req.guestId];
      let whereClause = 'WHERE is2.guest_id = $1';

      if (question_list_id) {
        params.push(question_list_id);
        whereClause += ` AND is2.question_list_id = $${params.length}`;
      }

      return client.query(
        `SELECT
           is2.id,
           is2.link_token,
           is2.status,
           is2.respondent_name,
           is2.created_at,
           is2.completed_at,
           is2.expires_at,
           is2.question_list_id,
           ql.title AS question_list_title,
           (SELECT COUNT(*) FROM interview_turns it
            WHERE it.interview_session_id = is2.id AND it.role = 'user') AS response_count,
           ist.current_section,
           ist.completed_sections
         FROM interview_sessions is2
         JOIN question_lists ql ON is2.question_list_id = ql.id
         LEFT JOIN interview_state ist ON ist.interview_session_id = is2.id
         ${whereClause}
         ORDER BY is2.created_at DESC`,
        params
      );
    });

    const appUrl = process.env.APP_URL || 'https://nitor8.vercel.app';
    const sessions = result.rows.map((s) => ({
      ...s,
      url: `${appUrl}/interview/${s.link_token}`,
    }));

    return res.json({ success: true, data: sessions });
  } catch (err) {
    console.error('[InterviewSessions] GET / error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '목록 조회 중 오류가 발생했습니다.' },
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/interview-sessions/:id
// 링크 비활성화 (status → abandoned)
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', authenticateGuest, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await withRLS(req.guestId, async (client) => {
      return client.query(
        `UPDATE interview_sessions
         SET status = 'abandoned'
         WHERE id = $1 AND guest_id = $2
         RETURNING id`,
        [id, req.guestId]
      );
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '세션을 찾을 수 없습니다.' },
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[InterviewSessions] DELETE /:id error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '비활성화 중 오류가 발생했습니다.' },
    });
  }
});

export default router;
