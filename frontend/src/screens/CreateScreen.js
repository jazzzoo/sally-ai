// frontend/src/screens/CreateScreen.js
// v4 fix: 백엔드 연동 버그 수정
//   1. res.session 으로 세션 ID 파싱
//   2. onComplete에서 questionListsApi.get() 호출 후 store 저장
//   3. 콜백: onChunk, onComplete, onError 만 사용
//   4. padding 단축 표기 제거

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert,
  Animated, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import GradientButton from '../components/GradientButton';
import NeuCard from '../components/NeuCard';
import QuestionsPanel from '../components/QuestionsPanel';
import HistorySidebar from '../components/HistorySidebar';
import useStore from '../store/useStore';
import { sessionsApi, streamGenerateQuestions, questionListsApi } from '../api/client';
import { colors, gradientColors, spacing, radius, textStyles } from '../theme';
import { ChevronsLeft, ChevronsRight } from 'lucide-react-native';

const STYLE_OPTIONS = ['Neutral', 'Deep', 'Soft'];
const STYLE_MAP = { 'Neutral': '기본', 'Deep': '깊게', 'Soft': '부드럽게' };
const MAX_SUMMARY = 1000;
const MOBILE_BP = 700;

// ── 점 애니메이션 (생성 중 표시) ─────────────────────────────
function DotIndicator() {
  const anims = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const sequence = (anim, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          Animated.delay(700),
        ])
      );
    const s0 = sequence(anims[0], 0);
    const s1 = sequence(anims[1], 200);
    const s2 = sequence(anims[2], 400);
    s0.start(); s1.start(); s2.start();
    return () => { s0.stop(); s1.stop(); s2.stop(); };
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 4,
            backgroundColor: colors.primaryMid,
            opacity: a,
          }}
        />
      ))}
      <Text style={{ fontSize: 14, color: colors.textSecondary, marginLeft: 6 }}>
        Sally is thinking...
      </Text>
    </View>
  );
}

function AnimatedCard({ item, index }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 120),
      Animated.timing(anim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false, // Expo Web은 false
      }),
    ]).start();
  }, [index, anim]);

  const isIce = item.type === 'icebreaker';

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        })
      }],
    }}>
      <NeuCard style={[styles.streamCard, {
        borderLeftWidth: 3,
        borderLeftColor: isIce ? colors.primaryMid : colors.primary,
      }]}>
        <Text style={{ fontSize: 14, color: isIce ? colors.primaryMid : colors.textDisabled, fontWeight: '700', marginBottom: 4 }}>
          {isIce ? '✦ Icebreaker' : `Q${item.number}`}
        </Text>
        <Text style={{ fontSize: 17, color: colors.textPrimary, lineHeight: 20 }}>
          {item.text}
        </Text>
      </NeuCard>
    </Animated.View>
  );
}

// ── 스켈레톤 카드 ────────────────────────────────────────────
function SkeletonCard({ opacity }) {
  return (
    <NeuCard style={[styles.streamCard, { opacity }]}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ width: 28, height: 11, backgroundColor: colors.border, borderRadius: 4 }} />
        <View style={{ flex: 1, height: 11, backgroundColor: colors.border, borderRadius: 4 }} />
      </View>
      <View style={{ height: 9, backgroundColor: colors.border, borderRadius: 4, width: '50%', marginTop: 7, marginLeft: 38 }} />
    </NeuCard>
  );
}

// ── 메인 ────────────────────────────────────────────────────
export default function CreateScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= MOBILE_BP;

  const {
    sessionForm, updateSessionForm, resetGeneration,
    isGenerating, setIsGenerating, generatedItems,
    cancelStream, appendGeneratedItem, setCloseStream,
    setCurrentSession, setNavTitle,
    setQuestionList, setCurrentListId, setHistoryRefresh,
    currentListId, questionListCache,
  } = useStore();

  const [extraInstr, setExtraInstr] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [leftVisible, setLeftVisible] = useState(true);
  const [mode, setMode] = useState('input'); // 'input' | 'generating' | 'questions'
  const rightScrollRef = useRef(null);

  const { businessSummary, persona, style } = sessionForm;
  const canSubmit = businessSummary.trim().length >= 20;

  useFocusEffect(
    React.useCallback(() => {
      setNavTitle('Preparing interview...');
      // 새로고침 후 복원
      if (currentListId && questionListCache[currentListId]) {
        setMode('questions');
        setNavTitle(businessSummary.trim().slice(0, 24));
      } else if (currentListId && !questionListCache[currentListId]) {
        questionListsApi.get(currentListId).then((res) => {
          setQuestionList(currentListId, res.question_list);
          setMode('questions');
          setNavTitle(businessSummary.trim().slice(0, 24));
        }).catch(() => {
          setMode('input');
        });
      }
      return () => { };
    }, [currentListId])
  );

  // ── 생성 시작 ────────────────────────────────────────────
  async function handleGenerate() {
    if (!canSubmit) {
      Alert.alert('Required', 'Please enter at least 20 characters.');
      return;
    }
    setIsLoading(true);
    setNavTitle('Generating Questions →');

    try {
      // 1. 세션 생성
      const res = await sessionsApi.create({
        session_type: 1,
        business_summary: businessSummary.trim(),
        persona: persona.trim() || undefined,
        style: STYLE_MAP[style] || '기본',
        additional_instruction: extraInstr.trim() || undefined,
      });

      // [수정] res.session (res.data?.session 아님)
      const session = res.session;
      if (!session?.id) throw new Error('Failed to receive session ID.');
      setCurrentSession(session);

      console.log('[DEBUG] 세션 생성 성공:', session.id);

      resetGeneration();
      setMode('generating');
      setIsGenerating(true);
      setNavTitle('Generating...');

      // 2. SSE 스트리밍 시작
      console.log('[DEBUG] streamGenerateQuestions 호출 시작');

      const close = await streamGenerateQuestions(session.id, {

        // token: 타이핑 미리보기만
        onIcebreaker: (item) => {
          console.log('[DEBUG] icebreaker 수신:', item.text?.slice(0, 20));
          appendGeneratedItem(item);
        },
        onQuestion: (item) => {
          console.log('[DEBUG] question 수신:', item.number);
          appendGeneratedItem(item);
        },

        // complete: question_list_id 받아서 REST로 질문 배열 가져오기
        onComplete: async (data) => {
          console.log('[DEBUG] complete 이벤트:', data);

          const listId = data.question_list_id;
          if (!listId) {
            console.error('[DEBUG] question_list_id 없음');
            setIsGenerating(false);
            setMode('input');
            Alert.alert('Error', 'Failed to receive question list ID.');
            return;
          }

          try {
            // REST GET으로 정규화된 질문 배열 가져오기
            const listRes = await questionListsApi.get(listId);
            const list = listRes.question_list;
            console.log('[DEBUG] 질문 리스트 로드 성공:', list.questions?.length, '개');

            // store에 저장
            setQuestionList(listId, list);
            setCurrentListId(listId);
            setHistoryRefresh(Date.now()); // ← 추가

            // UI 전환
            setIsGenerating(false);
            setNavTitle(businessSummary.trim().slice(0, 24));
            resetGeneration();

            // 카드 애니메이션이 보일 수 있도록 잠깐 대기
            await new Promise((resolve) => setTimeout(resolve, generatedItems.length * 120 + 500));

            if (isDesktop) {
              setMode('questions');
            } else {
              navigation.navigate('Questions');
            }
          } catch (fetchErr) {
            console.error('[DEBUG] 질문 리스트 GET 실패:', fetchErr.message);
            setIsGenerating(false);
            setMode('input');
            Alert.alert('Error', 'Failed to load questions.');
          }
        },

        onError: (err) => {
          console.error('[DEBUG] SSE 에러:', err.message);
          setIsGenerating(false);
          setMode('input');
          setNavTitle('Generation Error', err.message);
          Alert.alert('Generation Error', err.message || '스트리밍 중 문제가 발생했습니다.');
        },
      });

      setCloseStream(close);

    } catch (err) {
      console.error('[DEBUG] handleGenerate 오류:', err.message);
      setNavTitle('Generation Error', err.message);
      Alert.alert('Error', err.message || '세션 생성 중 문제가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  // ── 렌더 ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <View style={isDesktop ? styles.splitContainer : styles.mobileContainer}>

        {/* ══ 히스토리 사이드바 ══════════════════════════════ */}
        {isDesktop && (
          <HistorySidebar
            onSelect={(listId) => {
              setCurrentListId(listId);
              setMode('questions');
            }}
          />
        )}
        {/* ══ 왼쪽: 입력 폼 ══════════════════════════════════ */}
        {(isDesktop || mode === 'input') && (
          <View style={[
            styles.leftPanel,
            isDesktop && {
              width: leftVisible ? 400 : 40,
              overflow: 'hidden',
              borderRightWidth: 1,
              borderRightColor: colors.border,
            },
          ]}>
            {/* 토글 버튼 — 오른쪽 상단 고정 */}
            {isDesktop && (
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => setLeftVisible((v) => !v)}
                activeOpacity={0.8}
              >
                {leftVisible
                  ? <ChevronsLeft size={22} color={colors.textSecondary} strokeWidth={2.5} />
                  : <ChevronsRight size={22} color={colors.textSecondary} strokeWidth={2.5} />
                }
              </TouchableOpacity>
            )}
            {/* 입력 폼 — 숨김 시 안 보임 */}
            {leftVisible && (
              <ScrollView
                contentContainerStyle={styles.formScroll}
                keyboardShouldPersistTaps="handled"
                style={{ opacity: leftVisible ? 1 : 0 }}
              >
                <View style={styles.formHeader}>
                  <Text style={styles.formTitle}>Interview Prep</Text>
                  <Text style={styles.formSub}>Enter details below and AI will generate your questions</Text>
                </View>

                {/* ① 세션 */}
                <Field number="①" label="Select Session">
                  <View style={[styles.insetBox, styles.row]}>
                    <Text style={styles.inputText}>Problem Interview (Session 1)</Text>
                    <Text style={{ color: colors.primaryEnd }}>▾</Text>
                  </View>
                  <Text style={styles.hint}>A session to understand the severity and frequency of customer problems.</Text>
                </Field>

                {/* ② 사업 요약 */}
                <Field number="②" label="Business/Product Summary" required>
                  <TextInput
                    style={[styles.insetBox, styles.textarea]}
                    value={businessSummary}
                    onChangeText={(t) => updateSessionForm({ businessSummary: t })}
                    placeholder='"We build an AI-powered customer interview automation service for solo founders."'
                    placeholderTextColor={colors.placeholder}
                    multiline
                    maxLength={MAX_SUMMARY}
                    textAlignVertical="top"
                  />
                  <Text style={styles.charCount}>{businessSummary.length} / {MAX_SUMMARY}chars</Text>
                </Field>

                {/* ③ 타겟 고객 */}
                <Field number="③" label="Target Customer" optional>
                  <TextInput
                    style={[styles.insetBox, styles.singleInput]}
                    value={persona}
                    onChangeText={(t) => updateSessionForm({ persona: t })}
                    placeholder='"Solo developer working on a side project, early 30s"'
                    placeholderTextColor={colors.placeholder}
                  />
                </Field>

                {/* ④ 스타일 */}
                <Field number="④" label="Question Style">
                  <View style={styles.tabRow}>
                    {STYLE_OPTIONS.map((opt) => {
                      const active = style === opt;
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={styles.tabWrapper}
                          activeOpacity={0.8}
                          onPress={() => updateSessionForm({ style: opt })}
                        >
                          {active ? (
                            <LinearGradient
                              colors={gradientColors}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={styles.tabActive}
                            >
                              <Text style={styles.tabTextActive}>{opt}</Text>
                            </LinearGradient>
                          ) : (
                            <View style={styles.tabInactive}>
                              <Text style={styles.tabTextInactive}>{opt}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </Field>

                {/* ⑤ 추가 지시 */}
                <Field number="⑤" label="Additional Instructions" optional>
                  <TextInput
                    style={[styles.insetBox, styles.textarea, { minHeight: 56 }]}
                    value={extraInstr}
                    onChangeText={setExtraInstr}
                    placeholder='"SaaS B2B context, targeting budget decision makers"'
                    placeholderTextColor={colors.placeholder}
                    multiline
                    textAlignVertical="top"
                  />
                </Field>

                {/* CTA */}
                <GradientButton
                  label={isLoading ? 'Creating...' : mode === 'questions' ? '✦ Regenerate' : '✦ Generate Questions'}
                  onPress={handleGenerate}
                  disabled={!canSubmit || isLoading || isGenerating}
                  loading={isLoading}
                  style={{ marginTop: spacing.sm }}
                />
              </ScrollView>
            )}
          </View>
        )}

        {/* ══ 오른쪽: 생성 결과 패널 ════════════════════════ */}
        {isDesktop && (
          <View style={styles.rightPanel}>

            {/* 대기 상태 */}
            {mode === 'input' && (
              <View style={styles.rightEmpty}>
                <Text style={styles.emptyIcon}>✦</Text>
                <Text style={styles.emptyTitle}>Enter details on the left and click Generate</Text>
                <Text style={styles.emptyDesc}>
                  AI will generate interview questions{'\n'}based on the Lean Customer Development framework
                </Text>
              </View>
            )}

            {/* 생성 완료 — QuestionsPanel 전환 */}
            {mode === 'questions' && (
              <QuestionsPanel style={{ flex: 1 }} />
            )}

            {/* 생성 중 — 스트리밍 미리보기 */}
            {mode === 'generating' && (
              <ScrollView
                ref={rightScrollRef}
                contentContainerStyle={styles.rightScroll}
              >
                <Text style={styles.genTitle}>Generating Questions</Text>
                <Text style={styles.genSub}>Writing based on Lean Customer Development framework</Text>

                {/* 생성된 카드들 */}
                {generatedItems.map((item, idx) => (
                  <AnimatedCard key={idx} item={item} index={idx} />
                ))}

                {/* 생성 중 인디케이터 — 항상 맨 아래 */}
                <NeuCard style={[styles.streamCard, {
                  borderLeftWidth: 3,
                  borderLeftColor: colors.primary,
                }]}>
                  <DotIndicator />
                </NeuCard>

                {/* 취소 */}
                <TouchableOpacity
                  onPress={() => {
                    cancelStream();
                    setMode('input');
                    setNavTitle('Preparing interview...');
                  }}
                  style={{ alignItems: 'center', marginTop: spacing.sm }}
                >
                  <Text style={{ fontSize: 14, color: colors.textDisabled, textDecorationLine: 'underline' }}>
                    Cancel and start over
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Field 래퍼 ────────────────────────────────────────────────
function Field({ number, label, required, optional, children }) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.labelNum}>{number}</Text>
        <Text style={styles.labelText}>{label}</Text>
        {required && <Text style={styles.badge}>(required)</Text>}
        {optional && <Text style={styles.badge}>(optional)</Text>}
      </View>
      {children}
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  splitContainer: { flex: 1, flexDirection: 'row' },
  mobileContainer: { flex: 1 },

  leftPanel: { backgroundColor: colors.background },
  formScroll: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  formHeader: { gap: spacing.xs },
  formTitle: { fontSize: 22, fontWeight: '700', color: colors.textSecondary, letterSpacing: -0.4 },
  formSub: { fontSize: 14, color: colors.textSecondary },

  rightPanel: { flex: 1, backgroundColor: colors.background },

  toggleBtn: {
    alignSelf: 'flex-end',
    margin: spacing.xs,
    padding: spacing.xs,
  },
  toggleIcon: { fontSize: 20, color: colors.textSecondary, fontWeight: '900' },
  toggleText: { fontSize: 14, color: colors.textSecondary },

  rightEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    opacity: 0.5,
    padding: spacing.xl,
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 22, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  emptyDesc: { fontSize: 17, color: colors.textDisabled, textAlign: 'center', lineHeight: 20 },

  rightScroll: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.sm },
  genTitle: { fontSize: 22, fontWeight: '700', color: colors.textSecondary },
  genSub: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.xs },

  // [수정] padding 단축 표기 제거
  streamCard: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginBottom: spacing.sm,
  },

  field: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  labelNum: { fontSize: 20, color: colors.primaryMid, fontWeight: '600' },
  labelText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  badge: { fontSize: 14, color: colors.textSecondary },
  hint: { fontSize: 14, color: colors.textSecondary, lineHeight: 18 },
  charCount: { fontSize: 14, color: colors.textSecondary, textAlign: 'right' },

  insetBox: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  inputText: { fontSize: 17, color: colors.textPrimary },
  textarea: { minHeight: 100, padding: spacing.md, fontSize: 17, color: colors.textPrimary },
  singleInput: { paddingVertical: 12, paddingHorizontal: spacing.md, fontSize: 17, color: colors.textPrimary },

  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tabWrapper: { flex: 1 },
  tabActive: { borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  tabTextActive: { fontSize: 14, fontWeight: '600', color: '#fff' },
  tabInactive: {
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabTextInactive: { fontSize: 14, color: colors.textSecondary },
});