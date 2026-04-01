// frontend/src/screens/IntroScreen.js
// v4 변경:
//   - 피처 카드 3개 제거
//   - 서브텍스트 ~ CTA 사이: 프롬프트 박스 + 무한 위로 스크롤 텍스트

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import GradientButton from '../components/GradientButton';
import useStore       from '../store/useStore';
import { colors, gradientColors, spacing, radius, textStyles } from '../theme';

// ── 무한 스크롤 텍스트 6개 ─────────────────────────────────────
const HINTS = [
  'AI가 질문 10~15개를 자동 생성해요',
  "'왜 이 질문인가?' 코멘트도 함께 제공돼요",
  '린 고객개발 4세션 프레임워크를 따릅니다',
  '후속 질문 가이드도 자동으로 만들어줘요',
  '계정 없이 바로 시작할 수 있어요',
  '생성된 질문은 언제든지 수정 가능해요',
];

const ITEM_HEIGHT = 38;  // 한 줄 높이 (px)
const CYCLE_MS    = 2600; // 한 항목당 표시 시간

// CSS keyframes 웹 주입 — 한 번만
if (typeof document !== 'undefined') {
  const styleId = 'sally-marquee-style';
  if (!document.getElementById(styleId)) {
    const totalItems = HINTS.length;
    const el = document.createElement('style');
    el.id = styleId;
    // 각 항목이 올라가며 1줄씩 보임
    // translateY: 0 → -(N * ITEM_HEIGHT)
    el.textContent = `
      @keyframes sallyMarquee {
        0%          { transform: translateY(0px); }
        100%        { transform: translateY(-${totalItems * ITEM_HEIGHT}px); }
      }
      .sally-marquee-track {
        animation: sallyMarquee ${CYCLE_MS * totalItems}ms linear infinite;
      }
    `;
    document.head.appendChild(el);
  }
}

function MarqueeText() {
  // 웹: CSS animation / 네이티브: Animated fallback
  const isWeb = typeof document !== 'undefined';
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isWeb) return; // 웹은 CSS가 처리
    const total = HINTS.length * ITEM_HEIGHT;
    const anim = Animated.loop(
      Animated.timing(translateY, {
        toValue:         -total,
        duration:        CYCLE_MS * HINTS.length,
        useNativeDriver: true,
        easing:          (t) => t,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // 리스트를 3배 복제 → 끊김 없는 루프 보장
  const tripled = [...HINTS, ...HINTS, ...HINTS];

  if (isWeb) {
    return (
      <div style={{ height: ITEM_HEIGHT, overflow: 'hidden', position: 'relative' }}>
        <div className="sally-marquee-track">
          {tripled.map((hint, i) => (
            <div key={i} style={{
              height:      ITEM_HEIGHT,
              display:     'flex',
              alignItems:  'center',
              gap:         8,
            }}>
              <span style={{ fontSize: 14, color: '#E0B7C6' }}>✦</span>
              <span style={{ fontSize: 17, color: '#49546B' }}>{hint}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 네이티브 fallback
  return (
    <View style={marquee.clip}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {tripled.map((hint, i) => (
          <View key={i} style={marquee.row}>
            <Text style={marquee.bullet}>✦</Text>
            <Text style={marquee.text}>{hint}</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const marquee = StyleSheet.create({
  clip: {
    height:   ITEM_HEIGHT,
    overflow: 'hidden',
  },
  row: {
    height:        ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  bullet: { fontSize: 14, color: '#E0B7C6' },
  text:   { fontSize: 17, color: '#49546B' },
});

// ── 메인 컴포넌트 ────────────────────────────────────────────
export default function IntroScreen({ navigation }) {
  const { width }  = useWindowDimensions();
  const setNavTitle = useStore((s) => s.setNavTitle);

  useFocusEffect(
    React.useCallback(() => {
      setNavTitle('');   // 인트로에선 타이틀 비움
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.hero}>

          {/* 로고 */}
          <View style={styles.logoRow}>
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoBox}
            >
              <Text style={styles.logoIcon}>✦</Text>
            </LinearGradient>
            <Text style={styles.appName}>Sally.ai</Text>
          </View>

          {/* 헤드라인 */}
          <Text style={styles.headline}>
            린 고객개발 인터뷰를{'\n'}
            <Text style={styles.headlineAccent}>10분 안에 준비하세요</Text>
          </Text>

          {/* 서브 카피 */}
          <Text style={styles.subCopy}>
            AI가 린 고객개발 4세션 프레임워크에 맞춰{'\n'}
            인터뷰 질문을 자동 생성합니다.
          </Text>

          {/* ── 프롬프트 박스 + 무한 스크롤 텍스트 ── */}
          <View style={styles.promptBox}>
            <View style={styles.promptHeader}>
              <View style={styles.promptDot} />
              <Text style={styles.promptLabel}>Sally가 도와드릴 수 있어요</Text>
            </View>
            <MarqueeText />
          </View>

          {/* CTA */}
          <GradientButton
            label="✦ 지금 시작하기 →"
            onPress={() => navigation.navigate('Create')}
            style={styles.ctaWrapper}
          />
          <Text style={styles.noAccount}>계정 불필요 · 무료로 시작</Text>

        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },

  hero: {
    alignItems: 'center',
    maxWidth:   520,
    width:      '100%',
    gap:        spacing.lg,
  },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoBox: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  logoIcon: { fontSize: 24, color: '#fff' },
  appName: { fontSize: 36, fontWeight: '700', color: colors.textSecondary, letterSpacing: -0.8 },

  headline: {
    fontSize:     36,
    fontWeight:   '700',
    color:        colors.textSecondary,
    textAlign:    'center',
    lineHeight:   46,
    letterSpacing: -0.6,
  },
  headlineAccent: { color: colors.primaryEnd },

  subCopy: {
    fontSize:   15,
    color:      colors.textSecondary,
    textAlign:  'center',
    lineHeight: 24,
  },

  // 프롬프트 박스
  promptBox: {
    width:           '100%',
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    gap:             spacing.sm,
    // neumorphic inset
    shadowColor:     '#C5D1E0',
    shadowOffset:    { width: -3, height: -3 },
    shadowOpacity:   0.6,
    shadowRadius:    6,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
  },
  promptDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.primaryMid,
  },
  promptLabel: {
    fontSize:   11,
    fontWeight: '600',
    color:      colors.textSecondary,
    letterSpacing: 0.3,
  },

  ctaWrapper: { width: 240 },
  noAccount:  { fontSize: 14, color: colors.textDisabled },
});