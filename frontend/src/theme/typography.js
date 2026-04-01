// frontend/src/theme/typography.js
// Sally.ai 디자인 시스템 — 타이포그래피 + 스페이싱 + 래디우스

import { Platform } from 'react-native';

// ── 폰트 패밀리 ──────────────────────────────────────────────
// Phase 1: 시스템 폰트 fallback
// Phase 2: Pretendard 또는 Inter 정식 로드 예정
export const fontFamily = {
  regular: Platform.OS === 'ios' ? '-apple-system' : 'Roboto',
  semibold: Platform.OS === 'ios' ? '-apple-system' : 'Roboto',
  bold: Platform.OS === 'ios' ? '-apple-system' : 'Roboto',
};

// ── 타입 스케일 ───────────────────────────────────────────────
export const fontSize = {
  h1: 36,
  h2: 28,
  h3: 24,
  body: 22,
  bodyS: 20,
  caption: 17,
  micro: 14,
};

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export const lineHeight = {
  tight: 1.3,
  normal: 1.5,
  relaxed: 1.7,
};

// ── 텍스트 프리셋 (StyleSheet에서 spread 가능) ─────────────────
export const textStyles = {
  h1: {
    fontSize: fontSize.h1,
    fontWeight: fontWeight.bold,
    lineHeight: fontSize.h1 * lineHeight.tight,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: fontSize.h2,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.h2 * lineHeight.tight,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: fontSize.h3,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.h3 * lineHeight.normal,
  },
  body: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.body * lineHeight.normal,
  },
  bodyS: {
    fontSize: fontSize.bodyS,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.bodyS * lineHeight.normal,
  },
  caption: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.caption * lineHeight.relaxed,
  },
  button: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.body * lineHeight.tight,
    letterSpacing: 0.2,
  },
};

// ── 스페이싱 ──────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ── Border Radius ──────────────────────────────────────────────
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};