// frontend/src/components/NeuCard.js
// Neumorphic 카드 래퍼 — Generate, Questions 공통
//
// Props:
//   children      node      내부 콘텐츠
//   style         object    외부 스타일 오버라이드
//   accentColor   string    왼쪽 border 색상 (없으면 transparent)
//   pressed       bool      눌린 상태 shadow
//   onPress       fn        탭 핸들러 (없으면 TouchableOpacity 아님)

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius, shadows } from '../theme';

export default function NeuCard({
  children,
  style,
  accentColor,
  pressed = false,
  onPress,
}) {
  const container = [
    styles.card,
    accentColor
      ? { borderLeftColor: accentColor, borderLeftWidth: 3 }
      : { borderLeftColor: 'transparent', borderLeftWidth: 3 },
    pressed && styles.pressed,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={container}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={container}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 880,
    ...shadows.card,
  },
});