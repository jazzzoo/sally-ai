/// frontend/src/api/client.js
// Sally.ai API 클라이언트
// - 모든 요청에 x-guest-id 헤더 자동 포함
// - SSE 스트리밍 지원 (react-native-sse)
// - 공통 에러 처리

import EventSource from 'react-native-sse';
import { getGuestId } from '../store/guestStorage';

// ── 설정 ─────────────────────────────────────────────────────
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const TIMEOUT_MS = 120_000;

// ── 공통 헤더 빌더 ────────────────────────────────────────────
async function buildHeaders(extra = {}) {
  const guestId = await getGuestId();
  return {
    'Content-Type': 'application/json',
    ...(guestId ? { 'x-guest-id': guestId } : {}),
    ...extra,
  };
}

// ── 공통 응답 파싱 ────────────────────────────────────────────
async function parseResponse(res) {
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = json?.error?.code;
    err.status = res.status;
    err.details = json?.error?.details;
    throw err;
  }
  return json;
}

// ── REST 기본 메서드 ──────────────────────────────────────────
export async function apiGet(path) {
  const headers = await buildHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    return parseResponse(res);
  } finally {
    clearTimeout(timer);
  }
}

export async function apiPost(path, body) {
  const headers = await buildHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return parseResponse(res);
  } finally {
    clearTimeout(timer);
  }
}

export async function apiPatch(path, body) {
  const headers = await buildHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function apiDelete(path) {
  const headers = await buildHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers,
  });
  return parseResponse(res);
}

// ── SSE 스트리밍 ──────────────────────────────────────────────
/**
 * AI 질문 생성 스트리밍
 *
 * 백엔드 이벤트:
 *   start   — 스트리밍 시작 신호
 *   token   — AI 응답 텍스트 청크 (타이핑 미리보기용)
 *   complete — 완료 ({ question_list_id, question_count, ... })
 *   error   — 에러 ({ code, message })
 *   done    — 스트림 종료 신호
 *
 * @param {string} sessionId
 * @param {Object} callbacks
 * @param {Function} callbacks.onChunk    - (partialText: string) => void
 * @param {Function} callbacks.onComplete - ({ question_list_id, question_count }) => void
 * @param {Function} callbacks.onError    - (error: Error) => void
 * @returns {Function} close — 스트림 강제 종료 함수
 */
export async function streamGenerateQuestions(sessionId, callbacks) {
  const guestId = await getGuestId();
  const url = `${BASE_URL}/api/sessions/${sessionId}/generate-stream`;
  // SSE 연결 전 상태 체크
  const checkRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}/generate-stream`, {
    method: 'HEAD',
    headers: { 'x-guest-id': guestId || '' },
  });
  if (checkRes.status === 429) {
    callbacks.onError?.(new Error('오늘 생성 횟수를 초과했습니다. (하루 10회 제한)'));
    return () => { };
  }
  const es = new EventSource(url, {
    headers: {
      'x-guest-id': guestId || '',
    },
  });

  // ── 이벤트 핸들러 ─────────────────────────────────────────

  // token: AI 응답 텍스트 청크 → 타이핑 미리보기
  es.addEventListener('token', (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onChunk?.(data.text);
    } catch (_) { }
  });
  es.addEventListener('icebreaker', (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onIcebreaker?.(data);
    } catch (_) { }
  });

  es.addEventListener('question', (e) => {
    try {
      console.log('[DEBUG] question 이벤트 raw:', e.data?.slice(0, 50));
      const data = JSON.parse(e.data);
      callbacks.onQuestion?.(data);
    } catch (err) {
      console.error('[DEBUG] question parse 에러:', err.message, e.data?.slice(0, 100));
    }
  });
  // complete: 생성 완료 → question_list_id 포함
  es.addEventListener('complete', (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onComplete?.(data);
    } catch (_) { }
  });

  // done: 스트림 종료 신호
  es.addEventListener('done', () => {
    es.close();
  });

  // error: 서버 측 에러
  es.addEventListener('error', (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onError?.(new Error(data.message || '스트리밍 오류'));
    } catch (_) {
      callbacks.onError?.(new Error('스트리밍 연결 오류'));
    }
    es.close();
  });

  return () => es.close();
}

// ── 도메인별 API 함수 ─────────────────────────────────────────

// 세션
// [수정] URL: /api/projects/${projectId}/sessions → /api/sessions
export const sessionsApi = {
  create: (body) => apiPost('/api/sessions', body),
  get: (sessionId) => apiGet(`/api/sessions/${sessionId}`),
  history: () => apiGet('/api/sessions/history'),
};

// 질문 리스트
export const questionListsApi = {
  get: (listId) => apiGet(`/api/question-lists/${listId}`),
  updateOne: (listId, num, b) => apiPatch(`/api/question-lists/${listId}/questions/${num}`, b),
  regenerateOne: (listId, num, b) => apiPost(`/api/question-lists/${listId}/regenerate/${num}`, b),
  regenerateAll: (listId, b) => apiPost(`/api/question-lists/${listId}/regenerate`, b),
  hideOne: (listId, num, hidden) => apiPatch(`/api/question-lists/${listId}/questions/${num}/hide`, { hidden }),
  export: (listId, fmt) => apiGet(`/api/question-lists/${listId}/export?format=${fmt}`),
  favorite: (listId) => apiPatch(`/api/question-lists/${listId}/favorite`, {}),
  updateTitle: (listId, title) => apiPatch(`/api/question-lists/${listId}/title`, { title }),
  delete: (listId) => apiDelete(`/api/question-lists/${listId}`),
};

// 인터뷰 세션 (창업자용 - 인증 필요)
export const interviewSessionsApi = {
  create: (question_list_id) => apiPost('/api/interview-sessions', { question_list_id }),
  list: (question_list_id) =>
    apiGet(`/api/interview-sessions${question_list_id ? `?question_list_id=${question_list_id}` : ''}`),
  deactivate: (id) => apiDelete(`/api/interview-sessions/${id}`),
};

// 인터뷰 채팅 (응답자용 - 인증 없음, token 기반)
export const interviewApi = {
  getSession: async (token) => {
    const res = await fetch(`${BASE_URL}/api/interview/${token}`);
    return parseResponse(res);
  },
  start: async (token, name) => {
    const res = await fetch(`${BASE_URL}/api/interview/${token}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return parseResponse(res);
  },
  chat: async (token, content) => {
    const res = await fetch(`${BASE_URL}/api/interview/${token}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return parseResponse(res);
  },
};

// 리포트 (창업자용 - 인증 필요)
export const reportsApi = {
  list: () => apiGet('/api/reports'),
  get: (reportId) => apiGet(`/api/reports/${reportId}`),
  status: (reportId) => apiGet(`/api/reports/${reportId}/status`),
  generateAggregate: (questionListId) => apiPost(`/api/reports/aggregate/${questionListId}`, {}),
  getAggregate: (questionListId) => apiGet(`/api/reports/aggregate/${questionListId}`),
};

// 헬스체크
export const healthApi = {
  check: () => apiGet('/health'),
};