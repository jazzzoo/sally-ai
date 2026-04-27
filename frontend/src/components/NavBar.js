// frontend/src/components/NavBar.js
// v4 변경사항:
//   - 탭 4개 완전 제거
//   - 배경 = colors.background (surface → background)
//   - 하단 shadow 컬러 = background 계열
//   - 로고 클릭 → 인트로 이동 (CTA)
//   - 로고 오른쪽 30px: 동적 타이틀 텍스트

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import LegalModal from './LegalModal';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradientColors } from '../theme';
import useStore from '../store/useStore';

export default function NavBar({ onLogoPress }) {
  const navTitle = useStore((s) => s.navTitle);
  const [legalModal, setLegalModal] = useState(null); // 'privacy' | 'terms' | null

  return (
    <View style={styles.bar}>
      {/* 왼쪽: 로고 + 동적 타이틀 */}
      <View style={styles.left}>
        {/* 로고 — CTA */}
        <TouchableOpacity onPress={onLogoPress} activeOpacity={0.8} style={styles.logoBtn}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.logoBox}
          >
            <Text style={styles.logoIcon}>✦</Text>
          </LinearGradient>
          <Text style={styles.logoText}>Nitor8</Text>
        </TouchableOpacity>

        {/* 동적 타이틀 — 로고 오른쪽 30px */}
        {!!navTitle && (
          <Text style={styles.navTitle} numberOfLines={1}>
            {navTitle}
          </Text>
        )}
      </View>

      {/* 오른쪽: 링크들 */}
      <View style={styles.right}>
        <TouchableOpacity onPress={() => setLegalModal('privacy')}>
          <Text style={styles.legalLink}>Privacy</Text>
        </TouchableOpacity>
        <Text style={styles.guestLabel}> · </Text>
        <TouchableOpacity onPress={() => setLegalModal('terms')}>
          <Text style={styles.legalLink}>Terms</Text>
        </TouchableOpacity>
        <Text style={styles.guestLabel}> · Using as guest</Text>
      </View>

      <LegalModal
        visible={!!legalModal}
        type={legalModal}
        onClose={() => setLegalModal(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    backgroundColor: colors.background,   // ← surface → background
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    // 하단 shadow (background 계열)
    shadowColor: colors.background,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    zIndex: 100,
    // web sticky
    position: 'sticky',
    top: 0,
  },

  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,             // 로고와 타이틀 사이 30px
    flex: 1,
  },

  logoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: { fontSize: 20, color: '#fff', fontWeight: '700' },
  logoText: { fontSize: 20, fontWeight: '700', color: colors.textSecondary, letterSpacing: -0.3 },

  navTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    letterSpacing: -0.2,
    flexShrink: 1,
  },

  guestLabel: {
    fontSize: 14,
    color: colors.textDisabled,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legalLink: {
    fontSize: 14,
    color: colors.textDisabled,
    textDecorationLine: 'underline',
  },
});