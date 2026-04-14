// frontend/src/screens/InterviewScreen.js
// 응답자 전용 인터뷰 채팅 화면
// URL: /interview/:token (공개, 인증 불필요)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradientColors } from '../theme';
import { interviewApi } from '../api/client';

// ── 상수 ──────────────────────────────────────────────────────────
const MAX_INPUT_LENGTH = 1000;

// ── 채팅 버블 컴포넌트 ────────────────────────────────────────────
function ChatBubble({ role, content }) {
  const isAssistant = role === 'assistant';
  return (
    <View style={[styles.bubbleRow, isAssistant ? styles.bubbleRowLeft : styles.bubbleRowRight]}>
      {isAssistant && (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarBox}
        >
          <Text style={styles.avatarIcon}>✦</Text>
        </LinearGradient>
      )}
      <View style={[
        styles.bubble,
        isAssistant ? styles.bubbleAssistant : styles.bubbleUser,
      ]}>
        <Text style={[
          styles.bubbleText,
          isAssistant ? styles.bubbleTextAssistant : styles.bubbleTextUser,
        ]}>
          {content}
        </Text>
      </View>
    </View>
  );
}

// ── 입력 중 표시 ──────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowLeft]}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.avatarBox}
      >
        <Text style={styles.avatarIcon}>✦</Text>
      </LinearGradient>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        <Text style={styles.typingDots}>• • •</Text>
      </View>
    </View>
  );
}

// ── 이름 입력 화면 ────────────────────────────────────────────────
function NamePrompt({ onSubmit, isLoading }) {
  const [name, setName] = useState('');

  return (
    <View style={styles.namePromptOverlay}>
      <View style={styles.namePromptCard}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.namePromptLogo}
        >
          <Text style={styles.namePromptLogoIcon}>✦</Text>
        </LinearGradient>
        <Text style={styles.namePromptTitle}>Welcome to Sally.ai</Text>
        <Text style={styles.namePromptSubtitle}>
          What's your first name? Sally will use it during the interview.
        </Text>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Your first name..."
          placeholderTextColor={colors.placeholder}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && onSubmit(name.trim())}
          maxLength={50}
        />
        <TouchableOpacity
          style={[styles.startBtn, (!name.trim() || isLoading) && styles.startBtnDisabled]}
          onPress={() => name.trim() && onSubmit(name.trim())}
          disabled={!name.trim() || isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startBtnGradient}
            >
              <Text style={styles.startBtnText}>Start Interview →</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────────
export default function InterviewScreen({ route }) {
  const token = route?.params?.token;

  const [sessionInfo, setSessionInfo] = useState(null);
  const [turns, setTurns] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState(null);
  const [needsName, setNeedsName] = useState(false);

  const scrollRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  // 세션 로드
  useEffect(() => {
    if (!token) {
      setError('Invalid interview link.');
      setIsLoading(false);
      return;
    }

    async function loadSession() {
      try {
        const res = await interviewApi.getSession(token);
        setSessionInfo(res.data);
        setTurns(res.data.turns || []);
        setNeedsName(res.data.needs_name);
        setIsCompleted(res.data.status === 'completed');
        setIsLoading(false);
        scrollToBottom();
      } catch (err) {
        setError(err.message || 'Failed to load interview.');
        setIsLoading(false);
      }
    }

    loadSession();
  }, [token]);

  // 이름 제출 + 첫 인사 수신
  const handleNameSubmit = useCallback(async (name) => {
    setIsSending(true);
    try {
      const res = await interviewApi.start(token, name);
      setSessionInfo((prev) => ({ ...prev, respondent_name: name, needs_name: false }));
      setTurns(res.data.turns || []);
      setNeedsName(false);
      setIsCompleted(res.data.is_completed);
      scrollToBottom();
    } catch (err) {
      setError(err.message || 'Failed to start interview.');
    } finally {
      setIsSending(false);
    }
  }, [token]);

  // 메시지 전송
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending || isCompleted) return;

    setInputText('');
    setIsSending(true);

    // 유저 메시지 즉시 추가 (optimistic)
    const userTurn = { role: 'user', content: text };
    setTurns((prev) => [...prev, userTurn]);
    scrollToBottom();

    try {
      const res = await interviewApi.chat(token, text);
      const assistantTurn = res.data.message;
      setTurns((prev) => [...prev, assistantTurn]);
      setIsCompleted(res.data.is_completed);
      scrollToBottom();
    } catch (err) {
      // 전송 실패 시 유저 메시지 제거 + 에러 표시
      setTurns((prev) => prev.filter((t) => t !== userTurn));
      setInputText(text);
      setError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, isCompleted, token]);

  // 에러 표시
  if (error && !sessionInfo) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorIcon}>✦</Text>
        <Text style={styles.errorTitle}>Oops</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </SafeAreaView>
    );
  }

  // 로딩 중
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading interview...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* 헤더 */}
      <View style={styles.header}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerLogo}
        >
          <Text style={styles.headerLogoIcon}>✦</Text>
        </LinearGradient>
        <Text style={styles.headerTitle}>Sally.ai</Text>
        {isCompleted && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>Completed</Text>
          </View>
        )}
      </View>

      {/* 이름 입력 오버레이 */}
      {needsName && (
        <NamePrompt onSubmit={handleNameSubmit} isLoading={isSending} />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* 채팅 영역 */}
        <ScrollView
          ref={scrollRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToBottom}
        >
          {turns.length === 0 && !isSending && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Starting your interview...</Text>
            </View>
          )}

          {turns.map((turn, idx) => (
            <ChatBubble key={idx} role={turn.role} content={turn.content} />
          ))}

          {isSending && <TypingIndicator />}

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}>
                <Text style={styles.errorBannerDismiss}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* 입력 영역 */}
        {!isCompleted ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type your response..."
              placeholderTextColor={colors.placeholder}
              multiline
              maxLength={MAX_INPUT_LENGTH}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={handleSend}
              editable={!isSending && !needsName}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || isSending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || isSending}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={(!inputText.trim() || isSending) ? ['#C8D3E3', '#C8D3E3'] : gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sendBtnGradient}
              >
                <Text style={styles.sendBtnIcon}>↑</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.completedFooter}>
            <Text style={styles.completedText}>
              Thank you for completing the interview!
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  // 헤더
  header: {
    height: 56,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  headerLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textSecondary },
  completedBadge: {
    marginLeft: 'auto',
    backgroundColor: colors.success + '22',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  completedBadgeText: { fontSize: 12, color: colors.success, fontWeight: '600' },

  // 채팅
  chatScroll: { flex: 1 },
  chatContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },

  // 버블
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 4,
  },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },

  avatarBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarIcon: { fontSize: 14, color: '#fff', fontWeight: '700' },

  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextAssistant: { color: colors.textPrimary },
  bubbleTextUser: { color: colors.white },

  typingBubble: { paddingVertical: 14 },
  typingDots: { color: colors.textDisabled, fontSize: 16, letterSpacing: 4 },

  // 이름 입력 오버레이
  namePromptOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    padding: 24,
  },
  namePromptCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  namePromptLogo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  namePromptLogoIcon: { fontSize: 28, color: '#fff', fontWeight: '700' },
  namePromptTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  namePromptSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  nameInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginTop: 4,
  },
  startBtn: { width: '100%', borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  startBtnDisabled: { opacity: 0.5 },
  startBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // 입력 바
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    gap: 10,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: { borderRadius: 20, overflow: 'hidden' },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnGradient: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // 완료 푸터
  completedFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  completedText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // 에러
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: 24,
  },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  errorMessage: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  errorBanner: {
    backgroundColor: colors.error + '22',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    gap: 8,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: colors.error },
  errorBannerDismiss: { fontSize: 14, color: colors.error, fontWeight: '700' },

  // 로딩
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 12,
  },
  loadingText: { fontSize: 14, color: colors.textSecondary },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: colors.textDisabled },
});
