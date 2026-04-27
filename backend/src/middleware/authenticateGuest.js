import { query } from '../models/db.js';

// ─────────────────────────────────────────
// authenticateGuest 미들웨어
// PRD 11.4: 8단계 미들웨어 체인 중 4단계
//
// 검증 순서 (PRD 15.1):
//   1. x-guest-id 헤더 존재 확인
//   2. UUID 형식 검증
//   3. blocked_guests 테이블 차단 여부 확인
//   4. projects 테이블에서 guest_id 존재 확인
//      → 없으면 최초 방문 → 자동 허용 (게스트 모드)
//   5. req.guestId 설정 → 다음 미들웨어로 전달
// ─────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const authenticateGuest = async (req, res, next) => {
  const guestId = req.headers['x-guest-id'];

  // 1단계: 헤더 존재 확인
  if (!guestId) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '인증이 필요합니다. x-guest-id 헤더를 포함해주세요.',
      },
    });
  }

  // 2단계: UUID 형식 검증
  if (!UUID_REGEX.test(guestId)) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '유효하지 않은 guest_id 형식입니다.',
      },
    });
  }

  try {
    // 3단계: blocked_guests 차단 여부 확인 (PRD 10.3)
    const blockedResult = await query(
      `SELECT id FROM blocked_guests
       WHERE guest_id = $1
         AND (blocked_until IS NULL OR blocked_until > NOW())`,
      [guestId]
    );

    if (blockedResult.rows.length > 0) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: '접근이 제한된 계정입니다. 문의: support@nitor8.com',
        },
      });
    }

    // 4단계: guest_id 존재 여부 확인
    // → 없으면 최초 방문 (게스트 모드) → 통과 허용
    // → 있으면 기존 유저 → 통과
    // (projects 테이블에 guest_id가 있으면 기존 유저)
    const existingResult = await query(
      `SELECT id FROM projects
       WHERE guest_id = $1
         AND deleted_at IS NULL
       LIMIT 1`,
      [guestId]
    );

    // 5단계: req에 guestId 설정 → 라우트 핸들러에서 사용
    req.guestId = guestId;
    req.isNewGuest = existingResult.rows.length === 0;

    next();
  } catch (err) {
    console.error('[Auth] authenticateGuest error:', err.message);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '인증 처리 중 오류가 발생했습니다.',
      },
    });
  }
};