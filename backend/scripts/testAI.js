// ================================================
// backend/scripts/testAI.js
// Day 3 체크리스트 확인용 테스트 스크립트
// 실행: node scripts/testAI.js
// ================================================
require('dotenv').config({ path: '../.env' });
const { generateQuestions } = require('../src/services/aiService');

// 테스트용 샘플 입력 (PRD 6.3 유저 입력 플로우 기반)
const testInput = {
  business_summary: `초기 스타트업 창업자들이 고객 인터뷰를 어려워합니다.
어떤 질문을 해야 할지 모르고, 린 스타트업 원칙에 맞는 질문을 만드는 데
평균 2~3시간이 걸립니다. Sally.ai는 AI가 자동으로 검증된 인터뷰 질문을
생성해주는 서비스입니다.`,
  persona: '시드 단계 이전의 초기 스타트업 창업자 (1~3인 팀)',
  style: '기본',
  additional_instructions: '',
};

async function runTest() {
  console.log('='.repeat(50));
  console.log('Sally.ai Day 3 — Claude API 테스트');
  console.log('='.repeat(50));
  console.log('');
  console.log('입력:');
  console.log('  세션 타입: 1 (문제 인터뷰)');
  console.log('  사업 요약:', testInput.business_summary.substring(0, 50) + '...');
  console.log('  페르소나:', testInput.persona);
  console.log('');
  console.log('Claude 호출 중... (10~20초 소요)');
  console.log('');

  const startTime = Date.now();
  const result = await generateQuestions(1, testInput);
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!result.success) {
    console.error('❌ 실패:', result.error);
    process.exit(1);
  }

  const { questions, metadata } = result;

  // ---- 결과 출력 ----
  console.log('✅ 생성 성공!');
  console.log('');
  console.log('[ 메타데이터 ]');
  console.log(`  모델:          ${metadata.model}`);
  console.log(`  생성 시간:     ${totalTime}초`);
  console.log(`  입력 토큰:     ${metadata.input_tokens}`);
  console.log(`  출력 토큰:     ${metadata.output_tokens}`);
  console.log(`  비용:          $${metadata.cost_usd.toFixed(6)}`);
  console.log(`  폴백 사용:     ${metadata.fallback_used}`);
  console.log('');

  // ---- 아이스브레이킹 확인 ----
  console.log('[ 아이스브레이킹 ]');
  if (!questions.icebreakers || questions.icebreakers.length === 0) {
    console.log('  ❌ 아이스브레이킹 없음 — 프롬프트 수정 필요');
  } else {
    questions.icebreakers.forEach((ice, i) => {
      console.log(`  ${i + 1}. ${ice.text}`);
    });
  }
  console.log('');

  // ---- 질문 미리보기 (처음 3개) ----
  console.log('[ 질문 미리보기 (1~3번) ]');
  if (!questions.questions || questions.questions.length === 0) {
    console.log('  ❌ 질문 없음 — JSON 파싱 문제 확인 필요');
  } else {
    questions.questions.slice(0, 3).forEach(q => {
      console.log(`  Q${q.number}. ${q.text}`);
      console.log(`       → 왜: ${q.why?.substring(0, 60)}...`);
      console.log('');
    });
    console.log(`  ... 총 ${questions.questions.length}개 질문 생성됨`);
  }

  // ---- Day 3 체크리스트 자동 확인 ----
  console.log('');
  console.log('[ Day 3 체크리스트 ]');

  const checks = [
    {
      label: 'Claude API 호출 성공',
      pass:  result.success,
    },
    {
      label: '아이스브레이킹 3개',
      pass:  questions.icebreakers?.length === 3,
    },
    {
      label: '질문 10개',
      pass:  questions.questions?.length === 10,
    },
    {
      label: '각 질문에 why 필드 있음',
      pass:  questions.questions?.every(q => q.why),
    },
    {
      label: '각 질문에 후속 질문 있음',
      pass:  questions.questions?.every(q => q.follow_up?.length >= 1),
    },
    {
      label: `생성 시간 20초 이내 (실제: ${totalTime}초)`,
      pass:  parseFloat(totalTime) <= 20,
    },
    {
      label: `비용 $0.05 이하 (실제: $${metadata.cost_usd.toFixed(4)})`,
      pass:  metadata.cost_usd <= 0.05,
    },
  ];

  checks.forEach(c => {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.label}`);
  });

  const allPassed = checks.every(c => c.pass);
  console.log('');
  console.log(allPassed
    ? '🎉 Day 3 모든 체크리스트 통과!'
    : '⚠️  일부 항목 실패. 위 ❌ 항목 확인 필요.'
  );
  console.log('');
}

runTest().catch(err => {
  console.error('예상치 못한 에러:', err);
  process.exit(1);
});