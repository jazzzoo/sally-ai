// frontend/src/components/GradientButton.js
// 그라디언트 버튼 — 4개 화면 공통
//
// Props:
//   label       string    버튼 텍스트
//   onPress     fn        탭 핸들러
//   disabled    bool      비활성 (회색 처리)
//   loading     bool      로딩 중 (label 대신 "..." 표시)
//   style       object    외부에서 컨테이너 스타일 오버라이드
//   textStyle   object    텍스트 스타일 오버라이드
//   small       bool      소형 버튼 (재생성 바, 헤더 버튼 등)


import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradientColors, radius, textStyles, shadows } from '../theme';

export default function GradientButton({
  label,
  onPress,
  disabled = false,
  loading  = false,
  style,
  textStyle,
  small = false,
}) {
  const activeColors = disabled
    ? [colors.textDisabled, colors.textDisabled]
    : gradientColors;

  return (
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.85}
      onPress={disabled || loading ? undefined : onPress}
      style={style}
    >
      <LinearGradient
        colors={activeColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.gradient,
          small ? styles.small : styles.normal,
          !disabled && styles.activeShadow,
        ]}
      >
        <Text style={[styles.label, small && styles.labelSmall, textStyle]}>
          {loading ? '...' : label}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradient: {
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   radius.md,
  },
  normal: {
    paddingVertical:   16,
    paddingHorizontal: 24,
  },
  small: {
    paddingVertical:   8,
    paddingHorizontal: 14,
    borderRadius:      radius.sm,
  },
  activeShadow: {
    shadowColor:   '#A8BAD9',
    shadowOffset:  { width: 3, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius:  6,
    elevation:     5,
  },
  label: {
    ...textStyles.button,
    color: '#fff',
  },
  labelSmall: {
    ...textStyles.caption,
    fontWeight: '600',
    color:      '#fff',
  },
});