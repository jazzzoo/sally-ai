import express from 'express';
import { withRLS } from '../models/db.js';
import { authenticateGuest } from '../middleware/authenticateGuest.js';

const router = express.Router();
router.use(authenticateGuest);

// GET /api/reports — guest's report list with respondent_name
router.get('/', async (req, res) => {
  try {
    const rows = await withRLS(req.guestId, async (client) => {
      const { rows } = await client.query(
        `SELECT r.id, r.interview_session_id, r.status, r.created_at, r.completed_at,
                is2.respondent_name, is2.link_token
         FROM reports r
         JOIN interview_sessions is2 ON r.interview_session_id = is2.id
         WHERE r.guest_id = $1
         ORDER BY r.created_at DESC`,
        [req.guestId]
      );
      return rows;
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[reports] list error:', err.message);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } });
  }
});

// GET /api/reports/:id/status — polling endpoint
router.get('/:id/status', async (req, res) => {
  try {
    const row = await withRLS(req.guestId, async (client) => {
      const { rows } = await client.query(
        `SELECT status, updated_at FROM reports WHERE id = $1 AND guest_id = $2`,
        [req.params.id, req.guestId]
      );
      return rows[0] || null;
    });
    if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '리포트를 찾을 수 없습니다.' } });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('[reports] status error:', err.message);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } });
  }
});

// GET /api/reports/:id — single report detail
router.get('/:id', async (req, res) => {
  try {
    const row = await withRLS(req.guestId, async (client) => {
      const { rows } = await client.query(
        `SELECT r.id, r.interview_session_id, r.status, r.created_at, r.completed_at,
                CASE WHEN r.status = 'completed' THEN r.result ELSE NULL END AS result,
                is2.respondent_name, is2.link_token
         FROM reports r
         JOIN interview_sessions is2 ON r.interview_session_id = is2.id
         WHERE r.id = $1 AND r.guest_id = $2`,
        [req.params.id, req.guestId]
      );
      return rows[0] || null;
    });
    if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '리포트를 찾을 수 없습니다.' } });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('[reports] detail error:', err.message);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } });
  }
});

export default router;
