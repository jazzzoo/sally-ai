import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { checkConnection } from './models/db.js';
import sessionsRouter from './routes/sessions.js';
import questionListsRouter from './routes/questionLists.js';
import interviewSessionsRouter from './routes/interviewSessions.js';
import interviewRouter from './routes/interview.js';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────
// 미들웨어
// ─────────────────────────────────────────
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  exposedHeaders: ['Content-Type', 'Cache-Control'],
}));
app.options('*', cors());

// 보안 헤더
app.use(helmet({
  contentSecurityPolicy: false, // SSE 스트리밍 때문에 비활성화
  crossOriginEmbedderPolicy: false,
}));

// 요청 로깅
app.use(morgan('dev'));

// API Rate Limiting (전역)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 15분당 100회
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// SSE 스트리밍 전용 Rate Limiting
const streamLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1시간
  max: 20,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: '생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  },
});
app.use('/api/sessions/:id/generate-stream', streamLimiter);

app.use(express.json({ limit: '10mb' }));

// ─────────────────────────────────────────
// 요청 로깅 (개발용)
// ─────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

// ─────────────────────────────────────────
// 라우트
// ─────────────────────────────────────────
app.use('/api/sessions', sessionsRouter);
app.use('/api/question-lists', questionListsRouter);
app.use('/api/interview-sessions', interviewSessionsRouter); // 창업자용 링크 관리
app.use('/api/interview', interviewRouter);                  // 응답자용 공개 채팅

// ─────────────────────────────────────────
// 헬스체크
// ─────────────────────────────────────────
app.get('/health', async (req, res) => {
  const status = {
    server: 'ok',
    db: 'unknown',
    timestamp: new Date().toISOString(),
  };
  try {
    const dbResult = await checkConnection();
    status.db = 'ok';
    status.db_time = dbResult.time;
  } catch (err) {
    status.db = 'error';
    status.db_error = err.message;
  }
  const isHealthy = status.server === 'ok' && status.db === 'ok';
  return res.status(isHealthy ? 200 : 503).json({ success: isHealthy, data: status });
});

// ─────────────────────────────────────────
// 404 핸들러
// ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: '존재하지 않는 API 경로입니다.' },
  });
});

// ─────────────────────────────────────────
// 글로벌 에러 핸들러
// ─────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[App] Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
  });
});

// ─────────────────────────────────────────
// 서버 시작
// ─────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Sally.ai Backend — port ${PORT}`);
  try {
    await checkConnection();
    console.log('✅ PostgreSQL 연결 성공');
  } catch (err) {
    console.error('❌ PostgreSQL 연결 실패:', err.message);
  }

  console.log('\n[ 등록된 엔드포인트 ]');
  console.log('  GET  /health');
  console.log('  POST /api/sessions');
  console.log('  GET  /api/sessions/:id');
  console.log('  GET  /api/sessions/:id/generate-stream  ← SSE');
  console.log('  GET  /api/question-lists/:id');
  console.log('  POST /api/interview-sessions             ← 링크 생성');
  console.log('  GET  /api/interview-sessions             ← 링크 목록');
  console.log('  GET  /api/interview/:token               ← 공개 세션 조회');
  console.log('  POST /api/interview/:token/start         ← 이름 등록 + 첫 인사');
  console.log('  POST /api/interview/:token/chat          ← 채팅 턴');
});

export default app;