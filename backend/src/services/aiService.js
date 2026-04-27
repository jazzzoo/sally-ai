// ================================================
// backend/src/services/aiService.js
// PRD 14.1 ~ 14.4 기반
// Claude API 호출, 프롬프트 조립, 비용 추적
// ================================================

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 모델 설정 (PRD 14.1)
const MODELS = {
  primary: process.env.AI_MODEL_PRIMARY || 'claude-haiku-4-5-20251001',
  fallback: process.env.AI_MODEL_FALLBACK || 'claude-sonnet-4-6',
};
const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS) || 2048;

// Haiku 토큰 단가 (PRD 16.3 비용 추적용)
// 확인된 사실: https://www.anthropic.com/pricing 기준
const TOKEN_COST = {
  'claude-haiku-4-5-20251001': { input: 0.00000080, output: 0.000004 },
  'claude-sonnet-4-6':         { input: 0.000003,   output: 0.000015 },
};


// ------------------------------------------------
// 프롬프트 파일 로드
// ------------------------------------------------
function loadPrompt(filename) {
  const filePath = path.join(new URL('.', import.meta.url).pathname, '../../../server/prompts', filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`프롬프트 파일 없음: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}


// ------------------------------------------------
// 프롬프트 조립 (PRD 14.2 - 4단계 조립)
// 1. 공통 베이스
// 2. 세션별 규칙
// 3. 유저 입력 컨텍스트
// 4. 동적 지시 (재생성 시)
// ------------------------------------------------
function assemblePrompt(sessionType, inputContext, dynamicInstructions = '') {
  const basePrompt    = loadPrompt('base.txt');
  const sessionPrompt = loadPrompt(`session${sessionType}.txt`);

  const contextBlock = `
<user_context>
<business_summary>
${inputContext.business_summary}
</business_summary>

<persona>
${inputContext.persona || 'default assumption'}
</persona>

<style>
${inputContext.style || 'neutral'}
</style>

${inputContext.additional_instructions ? `
<additional_instructions>
${inputContext.additional_instructions}
</additional_instructions>
` : ''}
</user_context>`.trim();

  const dynamicBlock = dynamicInstructions
    ? `\n<dynamic_instructions>\n${dynamicInstructions}\n</dynamic_instructions>`
    : '';

  return [basePrompt, sessionPrompt, contextBlock, dynamicBlock]
    .filter(Boolean)
    .join('\n\n---\n\n');
}


// ------------------------------------------------
// 비용 계산 (PRD 16.3)
// ------------------------------------------------
function calculateCost(model, inputTokens, outputTokens) {
  const rate = TOKEN_COST[model] || TOKEN_COST['claude-haiku-4-5-20251001'];
  return (inputTokens * rate.input) + (outputTokens * rate.output);
}


// ------------------------------------------------
// Claude API 호출 (단일, 스트리밍 없음)
// Day 3: 기본 동작 확인용
// Day 4: SSE 스트리밍 버전으로 교체 예정
// ------------------------------------------------
async function callClaude(systemPrompt, userMessage, model) {
  const startTime = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const generationTimeMs = Date.now() - startTime;
  const inputTokens  = response.usage?.input_tokens  || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const costUsd      = calculateCost(model, inputTokens, outputTokens);
  const rawText      = response.content[0]?.text || '';

  return { rawText, inputTokens, outputTokens, costUsd, generationTimeMs };
}


// ------------------------------------------------
// JSON 파싱 (Claude가 가끔 ```json 붙이는 경우 처리)
// ------------------------------------------------
function parseJSON(rawText) {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(cleaned);
}


// ------------------------------------------------
// 질문 생성 메인 함수 (폴백 포함, PRD 14.3)
// ------------------------------------------------
async function generateQuestions(sessionType, inputContext, dynamicInstructions = '') {
  const systemPrompt  = assemblePrompt(sessionType, inputContext, dynamicInstructions);
  const userMessage = 'Generate interview questions following the instructions above. Output JSON only.';

  // 1차 시도: Primary 모델 (Haiku)
  try {
    const result = await callClaude(systemPrompt, userMessage, MODELS.primary);
    const parsed = parseJSON(result.rawText);

    return {
      success: true,
      questions: parsed,
      metadata: {
        model:             MODELS.primary,
        input_tokens:      result.inputTokens,
        output_tokens:     result.outputTokens,
        cost_usd:          result.costUsd,
        generation_time_ms: result.generationTimeMs,
        session_type:      sessionType,
        fallback_used:     false,
      },
      prompt_used: systemPrompt,
    };

  } catch (primaryError) {
    console.error('[AI] Primary 모델 실패, Fallback 시도:', primaryError.message);

    // 2차 시도: Fallback 모델 (Sonnet) — PRD 14.3
    try {
      const result = await callClaude(systemPrompt, userMessage, MODELS.fallback);
      const parsed = parseJSON(result.rawText);

      return {
        success: true,
        questions: parsed,
        metadata: {
          model:             MODELS.fallback,
          input_tokens:      result.inputTokens,
          output_tokens:     result.outputTokens,
          cost_usd:          result.costUsd,
          generation_time_ms: result.generationTimeMs,
          session_type:      sessionType,
          fallback_used:     true,
        },
        prompt_used: systemPrompt,
      };

    } catch (fallbackError) {
      console.error('[AI] Fallback 모델도 실패:', fallbackError.message);
      return {
        success: false,
        error: {
          code:    'AI_TIMEOUT',
          message: 'Nitor가 바빠요. 잠시 후 다시 시도해주세요.',
          detail:  fallbackError.message,
        },
      };
    }
  }
}


export { generateQuestions, assemblePrompt };