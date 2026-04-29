// frontend/src/screens/IntroScreen.js
// v4 변경:
//   - 피처 카드 3개 제거
//   - 서브텍스트 ~ CTA 사이: 프롬프트 박스 + 무한 위로 스크롤 텍스트

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import GradientButton from '../components/GradientButton';
import LogoMark from '../components/LogoMark';
import useStore from '../store/useStore';
import { colors, spacing, radius, textStyles } from '../theme';

// ── 무한 스크롤 텍스트 6개 ─────────────────────────────────────
const HINTS = [
  'AI auto-generates 10–15 interview questions',
  "'Why this question?' comments included",
  'Follows the Lean Customer Dev 4-session framework',
  'Follow-up question guides generated automatically',
  'No account needed — start instantly',
  'Generated questions can be edited anytime',
];

const ITEM_HEIGHT = 38;  // 한 줄 높이 (px)
const CYCLE_MS = 2600; // 한 항목당 표시 시간

// CSS keyframes 웹 주입 — 한 번만
if (typeof document !== 'undefined') {
  const styleId = 'nitor8-marquee-style';
  if (!document.getElementById(styleId)) {
    const totalItems = HINTS.length;
    const el = document.createElement('style');
    el.id = styleId;
    // 각 항목이 올라가며 1줄씩 보임
    // translateY: 0 → -(N * ITEM_HEIGHT)
    el.textContent = `
      @keyframes nitor8Marquee {
        0%          { transform: translateY(0px); }
        100%        { transform: translateY(-${totalItems * ITEM_HEIGHT}px); }
      }
      .nitor8-marquee-track {
        animation: nitor8Marquee ${CYCLE_MS * totalItems}ms linear infinite;
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
        toValue: -total,
        duration: CYCLE_MS * HINTS.length,
        useNativeDriver: true,
        easing: (t) => t,
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
        <div className="nitor8-marquee-track">
          {tripled.map((hint, i) => (
            <div key={i} style={{
              height: ITEM_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
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
    height: ITEM_HEIGHT,
    overflow: 'hidden',
  },
  row: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bullet: { fontSize: 14, color: '#E0B7C6' },
  text: { fontSize: 17, color: '#49546B' },
});

// ── 메인 컴포넌트 ────────────────────────────────────────────
export default function IntroScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const setNavTitle = useStore((s) => s.setNavTitle);

  useFocusEffect(
    React.useCallback(() => {
      if (typeof document !== 'undefined') document.title = 'Nitor8';
      setNavTitle('');   // 인트로에선 타이틀 비움
    }, [])
  );

  const [showBetaModal, setShowBetaModal] = useState(false);

  useEffect(() => {
    // TODO: 테스트 완료 후 localStorage 체크 복구
    setShowBetaModal(true);
  }, []);

  function dismissBetaModal() {
    if (typeof localStorage !== 'undefined') localStorage.setItem('nitor8-beta-notice', 'true');
    setShowBetaModal(false);
  }

  function BetaModal() {
    if (!showBetaModal) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: colors.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: colors.surface, borderRadius: radius.lg, maxWidth: 520, width: '100%', padding: 40, minHeight: 400 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: colors.textDisabled, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>BETA</p>
          <div>
            <p style={{ fontSize: 18, color: colors.textSecondary, marginBottom: 8, fontWeight: 400 }}>Welcome to</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <img src="/logodark.png" style={{ width: '65%', height: 'auto' }} alt="Nitor8" />
              <span style={{ fontSize: 18, fontWeight: 400, color: colors.textSecondary }}>Beta</span>
            </div>
          </div>
          <ul style={{ paddingLeft: 20, color: colors.textSecondary, fontSize: 18, lineHeight: '30px', marginTop: 24, marginBottom: 20 }}>
            <li>This is a beta version — features may change.</li>
            <li>Currently supports Session 1 (Problem Interview) only.</li>
            <li>Use the same browser &amp; device for best experience.</li>
            <li>Questions or feedback? <a href="https://x.com/nitor8_hq" style={{ color: colors.primary }}>@nitor8_hq on X</a></li>
          </ul>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 15 }}>
            <button onClick={dismissBetaModal} style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryMid}, ${colors.primaryEnd})`, color: colors.white, border: 'none', borderRadius: radius.md, padding: '12px 24px', fontSize: 19, fontWeight: 600, cursor: 'pointer', width: '40%' }}>Got it →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {typeof document !== 'undefined' && <BetaModal />}
      <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.hero}>

          {/* 로고 */}
          <View style={styles.logoRow}>
            <LogoMark size={48} />
            <Text style={styles.appName}>Nitor8</Text>
          </View>

          {/* 헤드라인 */}
          <Text style={styles.headline}>
            Prepare Your{'\n'}
            <Text style={styles.headlineAccent}>Customer Interview{'\n'}in 10 Minutes</Text>
          </Text>

          {/* 서브 카피 */}
          <Text style={styles.subCopy}>
            AI generates interview questions{'\n'}based on the Lean Customer Development framework.
          </Text>

          {/* ── 프롬프트 박스 + 무한 스크롤 텍스트 ── */}
          <View style={styles.promptBox}>
            <View style={styles.promptHeader}>
              <View style={styles.promptDot} />
              <Text style={styles.promptLabel}>Nitor8 can help you with</Text>
            </View>
            <MarqueeText />
          </View>

          {/* CTA */}
          <GradientButton
            label="✦ Get Started →"
            onPress={() => navigation.navigate('Create')}
            style={styles.ctaWrapper}
          />
          <Text style={styles.noAccount}>No account needed · Free to start</Text>

        </View>
      </View>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },

  hero: {
    alignItems: 'center',
    maxWidth: 520,
    width: '100%',
    gap: spacing.lg,
  },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  appName: { fontSize: 36, fontWeight: '700', color: colors.textSecondary, letterSpacing: -0.8 },

  headline: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 46,
    letterSpacing: -0.6,
  },
  headlineAccent: { color: colors.primaryEnd },

  subCopy: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },

  // 프롬프트 박스
  promptBox: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    // neumorphic inset
    shadowColor: '#C5D1E0',
    shadowOffset: { width: -3, height: -3 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  promptDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.primaryMid,
  },
  promptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },

  ctaWrapper: { maxWidth: 240, width: '100%' },
  noAccount: { fontSize: 14, color: colors.textDisabled },
});