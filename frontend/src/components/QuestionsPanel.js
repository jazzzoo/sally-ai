// frontend/src/components/QuestionsPanel.js
// QuestionsScreen UI를 공유 컴포넌트로 추출
// 데스크탑: CreateScreen 우측 패널에서 렌더
// 모바일:   QuestionsScreen에서 렌더

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, Clipboard,
  Share, Pressable, Modal, Platform,
} from 'react-native';

import NeuCard from './NeuCard';
import SlidePanel from './SlidePanel';
import EditPanel from './EditPanel';
import GradientButton from './GradientButton';
import ModalDialog from './ModalDialog';
import useStore from '../store/useStore';
import { questionListsApi, interviewSessionsApi } from '../api/client';
import { colors, spacing, radius, textStyles, shadows } from '../theme';
import { Copy, Share2 } from 'lucide-react-native';

export default function QuestionsPanel({ scrollRef, style }) {
  const { questionListCache, currentListId, generatedItems, updateQuestion, toggleHidden, setQuestionList, sessionForm } = useStore();
  const { businessSummary } = sessionForm;

  const listId = currentListId;
  const cached = questionListCache[listId];
  const items = cached?.questions?.length ? cached.questions : generatedItems;

  const [expanded, setExpanded] = useState(null);
  const [regenInput, setRegenInput] = useState('');
  const [isRegening, setIsRegening] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [isLoadingLink, setIsLoadingLink] = useState(false);

  const toggle = useCallback(
    (id) => setExpanded((prev) => (prev === id ? null : id)),
    []
  );

  async function handleRegenAll() {
    if (!listId) return;
    setIsRegening(true);
    try {
      await questionListsApi.regenerateAll(listId, {
        additional_instruction: regenInput.trim() || undefined,
      });
      Alert.alert('Regenerated', 'Questions have been regenerated.');
      setRegenInput('');
    } catch (err) {
      Alert.alert('error', err.message);
    } finally {
      setIsRegening(false);
    }
  }

  function handleCopy() {
    const txt = items
      .filter((i) => i.type !== 'reaction')
      .filter((i) => i.type !== 'reaction' && !i.hidden)
      .map((i) =>
        i.type === 'icebreaker'
          ? `✦ ${i.text}`
          : `Q${i.number}. ${i.text}`
      )
      .join('\n\n');
    Clipboard.setString(txt);
    Alert.alert('Copied', 'Copied to clipboard.');
  }

  function handleExportPress() {
    setShowFeedbackModal(true);
  }

  async function handleExport() {
    const md = items
      .filter((i) => i.type !== 'reaction')
      .filter((i) => i.type !== 'reaction' && !i.hidden)
      .map((i) =>
        i.type === 'icebreaker'
          ? `## 아이스브레이커\n${i.text}`
          : `### Q${i.number}\n${i.text}\n\n**왜 이 질문?** ${i.why || ''}`
      )
      .join('\n\n---\n\n');
    await Share.share({ message: md });
  }

  // 링크 조회(있으면 재사용) 또는 신규 생성
  async function handleFinalizePress() {
    if (!listId) return;
    setIsLoadingLink(true);
    try {
      const res = await interviewSessionsApi.list(listId);
      let url;
      if (res.data.length > 0) {
        url = res.data[0].url;
      } else {
        const created = await interviewSessionsApi.create(listId);
        url = created.data.url;
      }
      setShareLink(url);
      setShowLinkModal(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to get interview link.');
    } finally {
      setIsLoadingLink(false);
    }
  }

  const questionCount = items.filter((i) => i.type === 'question' && !i.hidden).length;
  const reactionCount = items.filter((i) => i.type === 'reaction').length;

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={() => setExpanded(null)}
    >
      <Pressable onPress={() => setExpanded(null)}>
        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {cached?.title || businessSummary || 'Session 1'}
            </Text>
            <Text style={styles.meta}>
              {questionCount} Questions + {reactionCount} Reactions
            </Text>
          </View>
          <View style={styles.headerBtns}>
            <TouchableOpacity style={styles.iconBtn} onPress={handleCopy} title="클립보드에 복사">
              <Copy size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={handleExportPress} title="공유하기">
              <Share2 size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 재생성 바 */}
        <View style={styles.regenRow}>
          <TextInput
            style={styles.regenInput}
            value={regenInput}
            onChangeText={setRegenInput}
            placeholder='"Make the questions deeper..."'
            placeholderTextColor={colors.placeholder}
          />
          <GradientButton
            label={isRegening ? '...' : 'Regenerate'}
            onPress={handleRegenAll}
            loading={isRegening}
            small
          />
        </View>

        {/* 카드 리스트 */}
        {items.map((item, idx) => {
          const id = item.id ?? idx;
          const isOpen = expanded === id;

          if (item.type === 'reaction') {
            return (
              <ReactionRow
                key={id}
                item={item}
                isOpen={isOpen}
                onToggle={() => toggle(id)}
                listId={listId}
                onUpdate={(p) => {
                  if (p.deleted) {
                    const hideKey = item.type === 'icebreaker' ? item.number : item.index;
                    const nextHidden = !item.hidden;
                    toggleHidden(listId, hideKey, nextHidden);
                    questionListsApi.hideOne(listId, hideKey, nextHidden)
                      .catch((err) => {
                        toggleHidden(listId, hideKey, !nextHidden);
                        window.alert('오류: ' + err.message);
                      });
                  } else {
                    updateQuestion(listId, item.number, p);
                  }
                }}
              />
            );
          }
          return (
            <QuestionRow
              key={id}
              item={item}
              isOpen={isOpen}
              onToggle={() => toggle(id)}
              listId={listId}
              onUpdate={(p) => {
                if (p.deleted) {
                  const hideKey = item.type === 'icebreaker' ? item.number : item.index;
                  const nextHidden = !item.hidden;
                  toggleHidden(listId, hideKey, nextHidden);
                  questionListsApi.hideOne(listId, hideKey, nextHidden)
                    .catch((err) => {
                      toggleHidden(listId, hideKey, !nextHidden);
                      window.alert('오류: ' + err.message);
                    });
                } else {
                  updateQuestion(listId, item.number, p);
                }
              }}
            />
          );
        })}

        {/* CTA — 인터뷰 링크 생성/공유 */}
        <GradientButton
          label={isLoadingLink ? 'Loading...' : 'Finalize → Share Link'}
          onPress={handleFinalizePress}
          loading={isLoadingLink}
          style={{ marginTop: spacing.md }}
        />
      </Pressable>

      {/* 인터뷰 링크 모달 */}
      <Modal
        visible={showLinkModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Your Interview Link</Text>
            <Text style={styles.modalSubtitle}>Share this link with your interviewee.</Text>

            <View style={styles.linkBox}>
              <Text style={styles.linkText} selectable>{shareLink}</Text>
            </View>

            <TouchableOpacity
              style={styles.modalBtnPrimary}
              onPress={() => {
                Clipboard.setString(shareLink);
                Alert.alert('Copied!', 'Interview link copied to clipboard.');
              }}
            >
              <Text style={styles.modalBtnPrimaryText}>Copy Link</Text>
            </TouchableOpacity>

            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => Share.share({ message: shareLink })}
              >
                <Text style={styles.modalBtnSecondaryText}>Share</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.modalBtnClose}
              onPress={() => setShowLinkModal(false)}
            >
              <Text style={styles.modalBtnCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 질문 리스트 공유 (Share2 아이콘 → 팀원 공유용) */}
      <ModalDialog
        visible={showFeedbackModal}
        title="Before you export..."
        message={["We'd love your feedback!", "It takes just 2 minutes,", "and helps us improve Sally.ai."]}
        mode="confirm"
        confirmLabel="✦ Share Feedback"
        cancelLabel="Skip & Export"
        confirmColor={colors.primaryEnd}
        onConfirm={() => {
          if (typeof window !== 'undefined') {
            window.open('https://docs.google.com/forms/d/e/1FAIpQLScl0kueIdfqU4HbRpZluQNBnpUcvaARvuQXYVWqQRkyLfTIKA/viewform?usp=header', '_blank');
          }
          setShowFeedbackModal(false);
          handleExport();
        }}
        onCancel={() => {
          setShowFeedbackModal(false);
          handleExport();
        }}
      />
    </ScrollView>
  );
}

// ── 리액션 행 ──────────────────────────────────────────────────
function ReactionRow({ item, isOpen, onToggle, listId, onUpdate }) {
  return (
    <View style={{ marginBottom: isOpen ? 0 : spacing.xs }}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggle}
        style={[
          styles.reactionCard,
          isOpen && {
            borderColor: colors.primary,
            backgroundColor: colors.surface,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          },
        ]}
      >
        <Text style={styles.diamond}>◇</Text>
        <Text style={styles.reactionText}>{item.text}</Text>
        <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>›</Text>
      </TouchableOpacity>
      <View
        onStartShouldSetResponder={() => true}
        onClick={(e) => e.stopPropagation()}
      >
        <SlidePanel open={isOpen}>
          <EditPanel item={item} listId={listId} onUpdate={onUpdate} />
        </SlidePanel>
      </View>
    </View>
  );
}

// ── 질문/아이스브레이커 행 ──────────────────────────────────────
function QuestionRow({ item, isOpen, onToggle, listId, onUpdate }) {
  const isIce = item.type === 'icebreaker';
  const accentColor = isIce
    ? colors.primaryMid
    : isOpen ? colors.primaryEnd : 'transparent';

  return (
    <View style={{ marginBottom: isOpen ? 0 : spacing.xs }}>
      <NeuCard
        accentColor={accentColor}
        pressed={isOpen}
        onPress={onToggle}
        style={[
          isOpen ? styles.cardOpen : undefined,
          item.hidden && { opacity: 0.3 },
        ]}
      >
        <View style={styles.qRow}>
          {!item.hidden && (
            <>
              <Text style={[
                styles.qBadge,
                { color: isIce ? colors.primaryMid : isOpen ? colors.primaryEnd : colors.primary },
              ]}>
                {isIce ? '✦' : `Q${item.number}`}
              </Text>
              <Text style={[styles.qText, isOpen && { fontWeight: '500' }]}>
                {item.text}
              </Text>
            </>
          )}
          <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>›</Text>
        </View>
      </NeuCard>
      <View style={{ pointerEvents: 'auto' }}>
        <View
          onStartShouldSetResponder={() => true}
          onClick={(e) => e.stopPropagation()}
        >
          <SlidePanel open={isOpen}>
            <EditPanel item={item} listId={listId} onUpdate={onUpdate} />
          </SlidePanel>
        </View>
      </View>
    </View>
  );
}

// ── 스타일 ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
    maxWidth: 880,
    alignSelf: 'center',
    width: '100%',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  title: { ...textStyles.h2, color: colors.textSecondary },
  meta: { ...textStyles.caption, color: colors.textSecondary, marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: spacing.xs },
  iconBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  iconBtnText: { fontSize: 17, color: colors.textSecondary },

  regenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    shadowColor: '#C5D1E0',
    shadowOffset: { width: -1, height: -1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  regenInput: {
    flex: 1,
    ...textStyles.bodyS,
    color: colors.textSecondary,
    paddingVertical: 10,
  },

  reactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  diamond: { ...textStyles.caption, color: colors.textDisabled },
  reactionText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 18,
  },

  cardOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  qRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  qBadge: { ...textStyles.caption, fontWeight: '700', minWidth: 28, paddingTop: 2 },
  qText: { ...textStyles.bodyS, color: colors.textPrimary, flex: 1, lineHeight: 22 },

  chevron: { fontSize: 17, color: colors.textDisabled, paddingTop: 2 },
  chevronOpen: { transform: [{ rotate: '90deg' }] },

  // ── 링크 모달 ────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
    gap: spacing.sm,
    ...shadows.card,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  linkBox: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  linkText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: colors.primary,
    lineHeight: 20,
  },
  modalBtnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  modalBtnSecondary: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  modalBtnClose: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalBtnCloseText: {
    fontSize: 14,
    color: colors.textDisabled,
  },
});
