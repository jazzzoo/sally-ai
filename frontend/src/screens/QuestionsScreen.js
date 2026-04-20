// frontend/src/screens/QuestionsScreen.js
// 모바일 전용 래퍼 — QuestionsPanel을 SafeAreaView로 감싼 것
// 데스크탑에서는 CreateScreen 우측 패널이 QuestionsPanel을 직접 렌더함

import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import QuestionsPanel from '../components/QuestionsPanel';
import useStore        from '../store/useStore';
import { colors } from '../theme';

export default function QuestionsScreen({ navigation }) {
  const setNavTitle = useStore((s) => s.setNavTitle);
  const sessionForm = useStore((s) => s.sessionForm);

  useFocusEffect(
    React.useCallback(() => {
      const title = sessionForm.businessSummary.trim().slice(0, 24) || 'Question List';
      setNavTitle(title);
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <QuestionsPanel navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});