// backend/scripts/seed-test-feedback.js
// 테스트용 seed 데이터 주입 — 완료된 피드백 인터뷰 2개 + 종합 리포트 1개
// 실행: node backend/scripts/seed-test-feedback.js  (프로젝트 루트에서)
//       node scripts/seed-test-feedback.js          (backend/ 에서)

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── 고정 UUID ────────────────────────────────────────────────────
const FEEDBACK_PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const FEEDBACK_SESSION_ID = '00000000-0000-0000-0000-000000000002';
const FEEDBACK_QLIST_ID   = '00000000-0000-0000-0000-000000000003';
const FEEDBACK_GUEST_ID   = '00000000-0000-0000-0000-000000000000';
const SESSION_A_ID        = '00000000-0000-0000-0000-000000000010';
const SESSION_B_ID        = '00000000-0000-0000-0000-000000000011';

// ── 전제 데이터 (project / session / question_list) ──────────────
const FEEDBACK_QUESTIONS = {
  icebreakers: [
    {
      section: 'icebreaker',
      text: 'Tell me about your startup. Who are you building for?',
      follow_up_hint: [
        "Can you tell me more about the specific customers you're targeting?",
        'What stage is your startup at right now?',
      ],
    },
  ],
  questions: [
    {
      section: 'context',
      text: 'Tell me about the first time you used Nitor8. What did you do?',
      follow_up_hint: [
        'What were you trying to accomplish at that point?',
        'Was that your first time doing a customer development interview?',
      ],
    },
    {
      section: 'problems',
      text: 'Which part of Nitor8 did you use the most? Which part did you not use?',
      follow_up_hint: [
        'Why did you find yourself going back to that part?',
        'Was there a reason you avoided or skipped the other parts?',
      ],
    },
    {
      section: 'problems',
      text: 'Was there a moment you thought this does not work for me? What happened?',
      follow_up_hint: [
        'How did you work around it at the time?',
        'Did that frustration change how you used the tool afterward?',
      ],
    },
    {
      section: 'alternatives',
      text: 'On a scale of 1 to 10, how likely are you to use Nitor8 again next month?',
      follow_up_hint: [
        'What would need to change to make that number higher?',
        "What's the main reason you gave that score?",
      ],
    },
    {
      section: 'wtp',
      text: 'What would you pay per month for a tool like this?',
      follow_up_hint: [
        'Is there a pricing model that would work better for you — like pay-per-use instead of monthly?',
        'What are you paying for similar tools right now?',
      ],
    },
    {
      section: 'wtp',
      text: 'What would make it worth that price to you?',
      follow_up_hint: [
        'If you imagine using this daily, what would it need to do?',
        'Is there a specific outcome or result that would justify the price?',
      ],
    },
    {
      section: 'wtp',
      text: 'Can you introduce me to 2 or 3 other founders who might need this?',
      follow_up_hint: [
        'What kind of founders do you think would benefit most from this?',
        'Would you be comfortable making an intro over email or Slack?',
      ],
    },
  ],
};

// ── 인터뷰 세션 정의 ────────────────────────────────────────────
const SESSIONS = [
  { id: SESSION_A_ID, respondent_name: 'Test User A', link_token: 'test-feedback-a' },
  { id: SESSION_B_ID, respondent_name: 'Test User B', link_token: 'test-feedback-b' },
];

// ── 대화 턴 ──────────────────────────────────────────────────────
const TURNS_A = [
  {
    role: 'assistant',
    content: "Hi Test User A! Great to meet you. Could you start by telling me about your startup — who are you building for?",
    section: 'icebreaker', question_index: 0, turn_index: 0,
  },
  {
    role: 'user',
    content: "We are building a tool for non-English speaking founders to do customer interviews more confidently. We target early-stage founders in Southeast Asia and Eastern Europe.",
    section: 'icebreaker', question_index: 0, turn_index: 1,
  },
  {
    role: 'assistant',
    content: "That sounds like a meaningful problem. Tell me about the first time you used Nitor8 — what were you trying to accomplish?",
    section: 'context', question_index: 0, turn_index: 2,
  },
  {
    role: 'user',
    content: "I had my first customer interview scheduled and had no idea what questions to ask. I used Nitor8 to generate a question list. It took about 5 minutes and I had a solid set of questions ready.",
    section: 'context', question_index: 0, turn_index: 3,
  },
  {
    role: 'assistant',
    content: "Was there a moment during your experience where you thought 'this does not work for me'? What happened?",
    section: 'problems', question_index: 0, turn_index: 4,
  },
  {
    role: 'user',
    content: "Yes — when I tried the AI chat interview, the responses felt generic. It did not adapt well when my interviewee went off-topic. I had to manually redirect them, which broke my focus.",
    section: 'problems', question_index: 0, turn_index: 5,
  },
  {
    role: 'assistant',
    content: "On a scale of 1 to 10, how likely are you to use Nitor8 again next month?",
    section: 'alternatives', question_index: 0, turn_index: 6,
  },
  {
    role: 'user',
    content: "I would say a 7. The question generation is genuinely useful. But I would pay more if the interview AI was smarter about following up and handling unexpected answers.",
    section: 'alternatives', question_index: 0, turn_index: 7,
  },
];

const TURNS_B = [
  {
    role: 'assistant',
    content: "Hi Test User B! Thanks for joining. Could you tell me a bit about yourself and the startup you are working on?",
    section: 'icebreaker', question_index: 0, turn_index: 0,
  },
  {
    role: 'user',
    content: "I am a solo founder building B2B SaaS for HR teams in India. My English is functional but I always felt nervous doing interviews with US customers because of my accent and vocabulary.",
    section: 'icebreaker', question_index: 0, turn_index: 1,
  },
  {
    role: 'assistant',
    content: "That context is really helpful. When you first used Nitor8, what was going on at that point in your journey?",
    section: 'context', question_index: 0, turn_index: 2,
  },
  {
    role: 'user',
    content: "I was about to do my third customer interview and the previous two felt scattered. A friend recommended Nitor8 and I tried it the night before the interview.",
    section: 'context', question_index: 0, turn_index: 3,
  },
  {
    role: 'assistant',
    content: "Which part of Nitor8 did you use most, and which part did you skip or avoid?",
    section: 'problems', question_index: 0, turn_index: 4,
  },
  {
    role: 'user',
    content: "I used the question list a lot — it saved me at least 2 hours. But I did not use the AI interview chat because I worried the respondent would notice they were talking to a bot and lose trust.",
    section: 'problems', question_index: 0, turn_index: 5,
  },
  {
    role: 'assistant',
    content: "What would you pay per month for a tool like this, if it solved these problems reliably?",
    section: 'wtp', question_index: 0, turn_index: 6,
  },
  {
    role: 'user',
    content: "Maybe 20 to 30 dollars a month. If Nitor8 saved me 3 or 4 hours per interview cycle, it would easily be worth that. I pay 15 dollars for Notion which is a daily tool.",
    section: 'wtp', question_index: 0, turn_index: 7,
  },
];

// ── 개별 리포트 결과 ─────────────────────────────────────────────
const INDIVIDUAL_RESULT_A = {
  problem_verdict: {
    status: 'confirmed',
    evidence_level: 'strong',
    reason: 'Test User A confirmed real friction with AI interview quality — off-topic handling failed requiring manual redirection, but question generation delivered clear time value.',
  },
  respondent_context: {
    role: 'Co-founder, early-stage SaaS (Southeast Asia / Eastern Europe focus)',
    segment_fit: 'high',
    context_summary: 'Founder actively doing customer development interviews. Has used Nitor8 for both question generation and interview facilitation. Core target segment — non-English speaking founder conducting English-language interviews.',
  },
  problem_situations: [
    {
      trigger: 'Scheduled customer interview with no prepared questions',
      job_context: 'Needed to prepare a structured interview in under an hour',
      quote: 'I had my first customer interview scheduled and had no idea what questions to ask.',
    },
    {
      trigger: 'Interviewee went off-topic during AI-facilitated chat',
      job_context: 'Trying to keep the interview on track without breaking rapport',
      quote: 'I had to manually redirect them.',
    },
  ],
  top_pains: [
    {
      title: 'AI interview does not adapt to off-topic responses',
      description: 'When the respondent goes off-script, the AI fails to redirect naturally, requiring the founder to intervene.',
      impact: 'Breaks interview flow; founder cannot focus on listening',
      frequency: 'Occurred during first AI-chat interview attempt',
      quote: 'The AI responses felt generic. It did not adapt well when my interviewee went off-topic.',
    },
  ],
  current_workarounds: [
    {
      method: 'Manual redirection by the founder mid-interview',
      why_used: 'AI chat did not handle off-topic answers automatically',
      complaint: 'Defeats the purpose of an AI interviewer — founder loses focus on listening',
    },
  ],
  consequences: [
    {
      type: 'quality',
      detail: 'Interview quality degraded when founder had to intervene instead of listening',
      quote: 'I had to manually redirect them.',
    },
  ],
  evidence_quotes: [
    'The AI responses felt generic. It did not adapt well when my interviewee went off-topic.',
    'I had to manually redirect them, which broke my focus.',
    'I would pay more if the interview AI was smarter about handling unexpected answers.',
  ],
  next_actions: [
    'Improve off-topic detection and graceful redirection in AI interview engine',
    'Interview 3 more founders in Southeast Asia who have done English-language customer interviews',
    'Test whether topic-detection improvement increases completion rate above 60%',
  ],
  next_questions: [
    'How often do interviewees go off-topic in typical customer development interviews?',
    'Would founders prefer to be notified and intervene, or have AI handle it silently?',
    'What would "smarter follow-up" look like in concrete terms for this user?',
  ],
};

const INDIVIDUAL_RESULT_B = {
  problem_verdict: {
    status: 'confirmed',
    evidence_level: 'medium',
    reason: 'Test User B validated question generation value strongly but expressed trust concerns about AI-facilitated interviews. English confidence anxiety is real and consistent with product thesis.',
  },
  respondent_context: {
    role: 'Solo founder, B2B SaaS for HR teams (India)',
    segment_fit: 'high',
    context_summary: 'Non-English speaking founder targeting US/UK customers. Uses Nitor8 for question prep only — avoids AI chat feature due to perceived respondent trust risk.',
  },
  problem_situations: [
    {
      trigger: 'Preparing for third customer interview after two unstructured sessions',
      job_context: 'Needed a structured question framework to avoid scattered conversations',
      quote: 'The previous two felt scattered. I did not have a good structure.',
    },
  ],
  top_pains: [
    {
      title: 'Unstructured interview preparation costs 2+ hours',
      description: 'Without a framework, building a good question set from scratch takes significant time and still results in scattered interviews.',
      impact: 'At least 2 hours per interview preparation cycle',
      frequency: 'Every interview session before discovering Nitor8',
      quote: 'It saved me at least 2 hours of preparation.',
    },
    {
      title: 'Concern that respondents will distrust AI interviewers',
      description: 'Founder chose not to use AI interview chat due to fear that respondents would notice and disengage.',
      impact: 'Core AI feature underutilized; founder still conducts interviews manually in English',
      frequency: 'Ongoing — has never tried AI chat feature',
      quote: 'I was worried the respondent would notice they were talking to a bot and lose trust.',
    },
  ],
  current_workarounds: [
    {
      method: 'Use Nitor8 for question generation only, then conduct interviews manually',
      why_used: 'Avoids perceived respondent trust risk from AI-facilitated interviews',
      complaint: 'Still requires confidence to run live English interviews — the core anxiety remains unsolved',
    },
  ],
  consequences: [
    {
      type: 'time',
      detail: '2+ hours per interview prep cycle saved with Nitor8 question generation',
      quote: 'It saved me at least 2 hours of preparation.',
    },
    {
      type: 'stress',
      detail: 'Ongoing anxiety about English quality during live interviews with US customers',
      quote: 'I always felt nervous doing interviews with US customers because of my accent and vocabulary.',
    },
  ],
  evidence_quotes: [
    'I always felt nervous doing interviews with US customers because of my accent and vocabulary.',
    'I was worried the respondent would notice they were talking to a bot and lose trust.',
    'If Nitor8 saved me 3 or 4 hours per interview cycle, it would easily be worth that.',
  ],
  next_actions: [
    'Survey existing users: what % avoid AI chat feature and why',
    'Test "Nitor transparency framing": inform respondents upfront that Nitor is AI, measure trust impact',
    'Interview 5 respondents who have been interviewed by AI tools — do they notice or care?',
  ],
  next_questions: [
    'Do respondents actually notice or care that they are talking to an AI?',
    'Would a human-style intro ("Hi, I am Nitor, an AI assistant for [Founder]") reduce the trust gap?',
    'What is the actual drop-off rate when respondents discover AI facilitation?',
  ],
};

// ── 종합 리포트 결과 ─────────────────────────────────────────────
const AGGREGATE_RESULT = {
  overall_verdict: {
    status: 'confirmed',
    evidence_level: 'medium',
    reason: "Both respondents confirmed the core pain — non-English speaking founders struggle with customer interview preparation and execution. Question generation saves 2+ hours per session. AI interview quality and respondent trust are the main blockers for full adoption. Two interviews provide directional signal; more data needed for strong evidence.",
  },
  respondent_count: 2,
  pattern_summary: "Both founders validated Nitor8's question generation as genuinely time-saving (2+ hours per session). The main adoption barrier is confidence in AI interview quality — one founder experienced off-topic handling failures, the other avoided AI chat entirely due to respondent trust concerns. English anxiety as a core motivator was consistent across both respondents, confirming the product thesis.",
  recurring_pains: [
    {
      title: 'Interview preparation takes 2+ hours without structure',
      frequency: '2/2 respondents',
      description: 'Both founders spent 2+ hours per interview building question sets before using Nitor8. This is the core validated pain and primary adoption driver.',
      representative_quote: 'It saved me at least 2 hours of preparation.',
    },
    {
      title: 'AI interview chat does not handle edge cases reliably',
      frequency: '2/2 respondents',
      description: "One founder experienced poor off-topic handling requiring manual redirection. The other avoided AI chat entirely due to perceived trust risk — both indicating a quality or confidence gap in the core AI interview feature.",
      representative_quote: "The AI responses felt generic. It did not adapt well when my interviewee went off-topic.",
    },
    {
      title: 'English anxiety creates friction in live interviews',
      frequency: '2/2 respondents',
      description: 'Both respondents mentioned language confidence as a primary motivation for using the tool, confirming the core product thesis.',
      representative_quote: 'I always felt nervous doing interviews with US customers because of my accent and vocabulary.',
    },
  ],
  common_workarounds: [
    {
      method: 'Use Nitor8 for question prep only, conduct interviews manually',
      frequency: '2/2 respondents',
      complaint: 'Founders still must conduct live interviews in English — the most anxiety-inducing part remains unsolved',
    },
    {
      method: 'Manual redirection mid-interview when AI fails',
      frequency: '1/2 respondents',
      complaint: 'Defeats the purpose of an AI interviewer; founder cannot focus on listening',
    },
  ],
  segment_insights: 'Both respondents are non-English-speaking founders targeting English-speaking markets, confirming strong segment fit. One is a co-founder (SEA/Eastern Europe, SaaS), the other a solo founder (India, HR SaaS). Solo founders may have higher sensitivity around AI trust due to relationship-management concerns — worth validating with a larger sample.',
  key_evidence_quotes: [
    "The AI responses felt generic. It did not adapt well when my interviewee went off-topic. I had to manually redirect them.",
    "I was worried the respondent would notice they were talking to a bot and lose trust.",
    "If Nitor8 saved me 3 or 4 hours per interview cycle, it would easily be worth 20 to 30 dollars a month.",
  ],
  next_actions: [
    'Improve AI interview off-topic detection and graceful redirection — #1 blocker for full adoption',
    'Test "Nitor transparency framing": inform respondents upfront that Nitor is AI, measure trust and completion impact',
    'Interview 5 more non-English speaking founders across India, Eastern Europe, and Southeast Asia to validate patterns',
  ],
  open_questions: [
    'Do respondents actually lose trust when they discover AI facilitation, or is this a founder assumption?',
    'What is the minimum AI interview quality threshold for founders to trust it with real respondents?',
    'Would a lower-priced question-generation-only plan satisfy founders who avoid AI chat entirely?',
  ],
  decision_recommendation: 'continue',
};

// ── 전제 데이터 보장 ─────────────────────────────────────────────
async function ensurePrerequisites(client) {
  await client.query(
    `INSERT INTO projects (id, guest_id, name, created_at)
     VALUES ($1, $2, 'Nitor8 Beta Feedback', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [FEEDBACK_PROJECT_ID, FEEDBACK_GUEST_ID]
  );
  await client.query(
    `INSERT INTO sessions (id, project_id, session_type, input_context, created_at)
     VALUES ($1, $2, 2, '{}', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [FEEDBACK_SESSION_ID, FEEDBACK_PROJECT_ID]
  );
  await client.query(
    `INSERT INTO question_lists (id, session_id, version, questions, title, is_favorite, created_at)
     VALUES ($1, $2, 1, $3, 'Nitor8 Beta Feedback Interview', false, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [FEEDBACK_QLIST_ID, FEEDBACK_SESSION_ID, JSON.stringify(FEEDBACK_QUESTIONS)]
  );
}

// ── 메인 ────────────────────────────────────────────────────────
async function seed() {
  const client = await pool.connect();
  try {
    await ensurePrerequisites(client);

    const sessionData = [
      { meta: SESSIONS[0], turns: TURNS_A, result: INDIVIDUAL_RESULT_A },
      { meta: SESSIONS[1], turns: TURNS_B, result: INDIVIDUAL_RESULT_B },
    ];

    for (const { meta, turns, result } of sessionData) {
      const existing = await client.query(
        `SELECT id FROM interview_sessions WHERE link_token = $1`,
        [meta.link_token]
      );
      if (existing.rows.length > 0) {
        console.log(`Skip: ${meta.respondent_name} interview (already exists)`);
        continue;
      }

      // interview_sessions
      await client.query(
        `INSERT INTO interview_sessions
           (id, question_list_id, guest_id, link_token, status, respondent_name,
            created_at, completed_at, expires_at)
         VALUES ($1, $2, $3, $4, 'completed', $5, NOW(), NOW(), NOW() + INTERVAL '30 days')`,
        [meta.id, FEEDBACK_QLIST_ID, FEEDBACK_GUEST_ID, meta.link_token, meta.respondent_name]
      );

      // interview_turns
      for (const t of turns) {
        await client.query(
          `INSERT INTO interview_turns
             (interview_session_id, role, content, section, question_index, turn_index, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [meta.id, t.role, t.content, t.section, t.question_index, t.turn_index]
        );
      }

      // interview_state
      const completedSections = [
        { section: 'icebreaker',   key_points: ['Introduced themselves and their startup'] },
        { section: 'context',      key_points: ['Described first use of Nitor8'] },
        { section: 'problems',     key_points: ['Identified key friction points'] },
        { section: 'alternatives', key_points: ['Rated likelihood to continue using'] },
        { section: 'wtp',          key_points: ['Discussed willingness to pay'] },
      ];
      await client.query(
        `INSERT INTO interview_state
           (interview_session_id, current_section, question_index, followup_count,
            completed_sections, no_response_count, updated_at)
         VALUES ($1, 'wrap_up', 0, 0, $2, 0, NOW())`,
        [meta.id, JSON.stringify(completedSections)]
      );

      // individual report
      await client.query(
        `INSERT INTO reports
           (interview_session_id, guest_id, type, status, result, created_at, completed_at)
         VALUES ($1, $2, 'individual', 'completed', $3, NOW(), NOW())`,
        [meta.id, FEEDBACK_GUEST_ID, JSON.stringify(result)]
      );

      console.log(`Seeded: ${meta.respondent_name} interview`);
    }

    // aggregate report
    const aggExisting = await client.query(
      `SELECT id FROM reports WHERE question_list_id = $1 AND type = 'aggregate'`,
      [FEEDBACK_QLIST_ID]
    );
    if (aggExisting.rows.length > 0) {
      console.log('Skip: aggregate report (already exists)');
    } else {
      await client.query(
        `INSERT INTO reports
           (guest_id, question_list_id, type, status, result, created_at, completed_at)
         VALUES ($1, $2, 'aggregate', 'completed', $3, NOW(), NOW())`,
        [FEEDBACK_GUEST_ID, FEEDBACK_QLIST_ID, JSON.stringify(AGGREGATE_RESULT)]
      );
      console.log('Seeded: aggregate report');
    }

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
