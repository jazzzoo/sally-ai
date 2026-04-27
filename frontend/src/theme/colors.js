// frontend/src/theme/colors.js
// Nitor8 디자인 시스템 — 컬러 토큰 (확정)

export const lightColors = {
  background:    '#E9EEF2',
  surface:       '#F2FAFA',
  textPrimary:   '#141924',
  textSecondary: '#49546B',
  primary:       '#A8BAD9',
  primaryMid:    '#E0B7C6',
  primaryEnd:    '#FF8A80',
  border:        '#C8D3E3',
  textDisabled:  '#B0BAC6',
  placeholder:   '#9AA5B4',
  white:         '#FFFFFF',
  overlay:       'rgba(0,0,0,0.4)',

  // 시맨틱
  error:   '#FF5252',
  success: '#66BB6A',
  warning: '#FFA726',
};

export const darkColors = {
  background:    '#1E1E1E',
  surface:       '#2A2A2A',
  textPrimary:   '#F0F0F0',
  textSecondary: '#A0A0A0',
  primary:       '#7A8DB3',
  primaryMid:    '#C89EB0',
  primaryEnd:    '#FFAAA0',
  border:        '#3A3A3A',
  textDisabled:  '#555555',
  placeholder:   '#666666',
  white:         '#FFFFFF',
  overlay:       'rgba(0,0,0,0.6)',

  error:   '#FF5252',
  success: '#66BB6A',
  warning: '#FFA726',
};

// Phase 1: 라이트 모드만 사용
export const colors = lightColors;

// 그라디언트 (LinearGradient용 colors 배열)
export const gradientColors = [
  colors.primary,
  colors.primaryMid,
  colors.primaryEnd,
];