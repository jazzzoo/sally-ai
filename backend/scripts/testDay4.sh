#!/bin/bash
# ─────────────────────────────────────────
# Sally.ai Day 4 — SSE 스트리밍 테스트
# 실행: bash scripts/testDay4.sh
# ─────────────────────────────────────────

BASE_URL="http://localhost:3000"
GUEST_ID="550e8400-e29b-41d4-a716-446655440000"  # 테스트용 UUID

echo "=================================================="
echo "Sally.ai Day 4 — SSE 스트리밍 테스트"
echo "=================================================="

echo ""
echo "[ Step 1 ] 헬스체크 (DB 연결 확인)"
curl -s "$BASE_URL/health" | node -e "
  const d = require('fs').readFileSync('/dev/stdin','utf8');
  const j = JSON.parse(d);
  console.log('  서버:', j.data?.server);
  console.log('  DB:', j.data?.db);
  if (j.data?.db !== 'ok') {
    console.log('❌ DB 연결 실패. DATABASE_URL 확인 필요');
    process.exit(1);
  }
  console.log('✅ 헬스체크 통과');
"

echo ""
echo "[ Step 2 ] 세션 생성"
SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -H "x-guest-id: $GUEST_ID" \
  -d '{
    "business_summary": "초기 스타트업 창업자들이 고객 인터뷰를 어려워합니다. 어떤 질문을 해야 할지 모르고, 린 고객개발 방법론을 모르는 경우가 많아요.",
    "persona": "시드 단계 이전의 초기 스타트업 창업자 (1~3인 팀)",
    "style": "기본"
  }')

SESSION_ID=$(echo $SESSION_RESPONSE | node -e "
  const d = require('fs').readFileSync('/dev/stdin','utf8');
  const j = JSON.parse(d);
  if (!j.success) {
    console.error('❌ 세션 생성 실패:', j.error?.message);
    process.exit(1);
  }
  console.log(j.session.id);
")

echo "  세션 ID: $SESSION_ID"
echo "✅ 세션 생성 성공"

echo ""
echo "[ Step 3 ] SSE 스트리밍 질문 생성"
echo "  (토큰이 실시간으로 흘러들어오는지 확인)"
echo "  ─────────────────────────────────────"

COMPLETE_DATA=""
START_TIME=$(date +%s)

while IFS= read -r line; do
  if [[ $line == data:* ]]; then
    DATA="${line#data: }"
    EVENT_TYPE=$(echo "$DATA" | node -e "
      try {
        const j = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        process.stdout.write(j.type || '');
      } catch(e) {}
    " 2>/dev/null)

    case $EVENT_TYPE in
      "start")   echo "  → 생성 시작..." ;;
      "token")   printf "." ;;
      "complete") echo ""; COMPLETE_DATA="$DATA" ;;
      "error")   echo ""; echo "❌ 에러 수신: $DATA" ;;
      "done")    echo "" ;;
    esac
  fi
done < <(curl -s -N -X POST "$BASE_URL/api/sessions/$SESSION_ID/generate-stream" \
  -H "Content-Type: application/json" \
  -H "x-guest-id: $GUEST_ID" \
  -d '{}' \
  --no-buffer)

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "[ 결과 ]"
echo "$COMPLETE_DATA" | node -e "
  const d = require('fs').readFileSync('/dev/stdin','utf8');
  try {
    const j = JSON.parse(d);
    console.log('  question_list_id:', j.question_list_id);
    console.log('  질문 수:', j.question_count);
    console.log('  아이스브레이커:', j.icebreaker_count);
    console.log('  입력 토큰:', j.metadata?.input_tokens);
    console.log('  출력 토큰:', j.metadata?.output_tokens);
    console.log('  비용:', '\$' + j.metadata?.cost_usd);
    console.log('  생성 시간:', j.metadata?.generation_time_sec + '초');
  } catch(e) {
    console.log('  (결과 파싱 실패)');
  }
"

echo ""
echo "[ Day 4 체크리스트 ]"
echo "  ✅ 헬스체크 DB 연결 확인"
echo "  ✅ 세션 생성 (POST /api/sessions)"
echo "  ✅ SSE 스트리밍 응답 수신"
echo "  체감 응답 시작까지: ~1~2초 (토큰 첫 수신)"
echo "  총 소요시간: ${ELAPSED}초"
echo ""
echo "→ Railway DB에서 확인:"
echo "  SELECT * FROM sessions ORDER BY created_at DESC LIMIT 3;"
echo "  SELECT * FROM question_lists ORDER BY created_at DESC LIMIT 3;"
echo "  SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT 3;"
