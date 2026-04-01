// frontend/src/theme/shadows.js
// Sally.ai 디자인 시스템 — Neumorphism Shadow 토큰

import { colors } from './colors';

// React Native는 단일 shadow만 지원 → 핵심 shadow만 추출
// (iOS: shadow*, Android: elevation)
export const shadows = {
  // 카드 / 버튼 (볼록 느낌)
  card: {
    shadowColor:   '#C5D1E0',
    shadowOffset:  { width: 4, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius:  8,
    elevation:     4,
  },

  // 눌렸을 때 (살짝 깊어짐)
  pressed: {
    shadowColor:   '#C5D1E0',
    shadowOffset:  { width: 2, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius:  5,
    elevation:     2,
  },

  // inset 효과 — React Native 직접 지원 안 함
  // → backgroundColor + inner border로 대체
  // → 아래 insetStyle 사용
  inset: {
    backgroundColor: colors.background,
    borderWidth:     1,
    borderColor:     colors.border,
    // iOS inner shadow 근사
    shadowColor:     '#C5D1E0',
    shadowOffset:    { width: -1, height: -1 },
    shadowOpacity:   0.3,
    shadowRadius:    4,
    elevation:       0,
  },

  // 버튼 그림자 (그라디언트 버튼)
  button: {
    shadowColor:   '#A8BAD9',
    shadowOffset:  { width: 3, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius:  6,
    elevation:     5,
  },

  // 모달 / 오버레이
  modal: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius:  24,
    elevation:     12,
  },
};