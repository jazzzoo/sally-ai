import pg from 'pg';

const { Pool } = pg;

// ─────────────────────────────────────────
// PostgreSQL 연결 풀
// ─────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,                // 최대 연결 수
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// 연결 오류 글로벌 핸들러
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// ─────────────────────────────────────────
// 기본 쿼리 함수
// ─────────────────────────────────────────
export const query = (text, params) => pool.query(text, params);

// ─────────────────────────────────────────
// RLS 트랜잭션 래퍼
// PRD 15.1: 모든 보호된 쿼리는 이 함수를 통해 실행
//
// 사용법:
//   const result = await withRLS(guestId, async (client) => {
//     return client.query('SELECT * FROM projects');
//   });
// ─────────────────────────────────────────
export const withRLS = async (guestId, callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // PostgreSQL 세션 변수 설정 — RLS 정책이 이 값을 참조
    // PRD: current_setting('app.current_guest_id')::uuid
    await client.query(
      `SET LOCAL app.current_guest_id = '${guestId}'`
    );

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────
// DB 연결 상태 확인 (헬스체크용)
// ─────────────────────────────────────────
export const checkConnection = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() as time');
    return { ok: true, time: result.rows[0].time };
  } finally {
    client.release();
  }
};

export default pool;