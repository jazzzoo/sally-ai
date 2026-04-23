// frontend/src/components/EditPanel.js
// 인라인 편집 패널 — QuestionsScreen에서 SlidePanel 안에 렌더링
// 타입(icebreaker / reaction / question)에 따라 UI 분기
//
// Props:
//   item      object    { type, text, number, why, follow_up }
//   listId    string    질문 리스트 ID (AI 수정 API 호출용)
//   onUpdate  fn        (patch) => void — 수정 완료 후 store 업데이트

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { questionListsApi } from '../api/client';
import GradientButton from './GradientButton';
import { colors, gradientColors, spacing, radius, textStyles } from '../theme';
import { EyeOff, Eye, Pencil, X } from 'lucide-react-native';

export default function EditPanel({ item, listId, onUpdate }) {
  const isIce = item.type === 'icebreaker';
  const isReaction = item.type === 'reaction';

  const accent = isIce ? colors.primaryMid
    : isReaction ? colors.primary
      : colors.primaryEnd;

  const label = isIce ? '✦ Edit Icebreaker'
    : isReaction ? '◇ Edit Reaction'
      : `Edit Q${item.number}`;

  const aiPlaceholder = isIce ? '"Make it warmer, start lightly..."'
    : isReaction ? '"Express more empathy..."'
      : '"Make it softer, add empathy..."';

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);

  const [aiInstruction, setAiInstruction] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const isHidingRef = React.useRef(false);

  async function handleAiEdit() {
    console.log('[DEBUG] regenerate 요청:', { type: item.type, text: item.text?.slice(0, 20), number: item.number });
    if (!aiInstruction.trim() || !listId) return;
    setIsAiLoading(true);
    try {
      const res = await questionListsApi.regenerateOne(
        listId,
        item.type === 'icebreaker' ? item.number : (item.index ?? item.number),
        { instruction: aiInstruction.trim(), type: item.type, text: item.text },
      );
      console.log('[DEBUG] res.question:', JSON.stringify(res.question));
      onUpdate?.(res.question);
      setAiInstruction('');
      setRevisionReason(res.question?.revision_reason || '');
    } catch (err) {
      Alert.alert('Edit Error', err.message);
    } finally {
      setIsAiLoading(false);
    }
  }

  return (
    <View style={[styles.panel, { borderColor: accent }]}>
      {/* 패널 헤더 */}
      <View style={styles.panelHeader}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentBar}
        />
        <Text style={[styles.panelLabel, { color: accent }]}>{label}</Text>
      </View>

      <View style={styles.panelBody}>
        {/* 현재 텍스트 (아이스브레이커 / 리액션만) */}
        {(isIce || isReaction) && (
          <Section label="Current Text">
            <View style={styles.insetBox}>
              {isEditing ? (
                <>
                  <TextInput
                    style={[styles.currentText, { minHeight: 60 }]}
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={() => { onUpdate?.({ text: editText }); setIsEditing(false); }}
                    style={{ marginTop: 6, alignItems: 'flex-end' }}
                  >
                    <Text style={{ fontSize: 14, color: colors.primaryEnd, fontWeight: '600' }}>Save</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={() => setIsEditing(true)}>
                  <Text style={styles.currentText}>{item.text}</Text>
                </TouchableOpacity>
              )}
            </View>
          </Section>
        )}

        {/* 질문 텍스트 + 번역 (일반 질문만, text_translated 있을 때) */}
        {!isIce && !isReaction && item.text_translated && (
          <Section label="Question">
            <View style={styles.insetBox}>
              <Text style={styles.translatedNoteLabel}>EN — Respondent</Text>
              <Text style={styles.currentText}>{item.text}</Text>
            </View>
            <View style={[styles.insetBox, { marginTop: spacing.xs }]}>
              <Text style={styles.translatedNoteLabel}>Translation</Text>
              <Text style={styles.currentText}>{item.text_translated}</Text>
            </View>
          </Section>
        )}

        {/* 질문 텍스트 직접 수정 (일반 질문만) */}
        {!isIce && !isReaction && isEditing && (
          <Section label="Edit Text (EN)">
            <View style={styles.insetBox}>
              <TextInput
                style={[styles.currentText, { minHeight: 60 }]}
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
              />
              <TouchableOpacity
                onPress={() => { onUpdate?.({ text: editText }); setIsEditing(false); }}
                style={{ marginTop: 6, alignItems: 'flex-end' }}
              >
                <Text style={{ fontSize: 14, color: colors.primaryMid, fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </Section>
        )}

        {/* 왜 이 질문? (일반 질문만) - 번역 우선, 영어 원문 아래 표시 */}
        {!isIce && !isReaction && (item.why || item.why_translated) && (
          <Section label="Why This Question?">
            <View style={styles.whyBox}>
              <Text style={styles.whyLabel}>Why? </Text>
              <Text style={styles.whyText}>{item.why_translated || item.why}</Text>
            </View>
            {item.why_translated && (
              <View style={[styles.whyBox, { marginTop: spacing.xs }]}>
                <Text style={styles.enNoteLabel}>EN </Text>
                <Text style={styles.enNoteText}>{item.why}</Text>
              </View>
            )}
          </Section>
        )}

        {/* 후속 질문 (일반 질문만) */}
        {!isIce && !isReaction && (item.follow_up_hint || item.follow_up)?.length > 0 && (
          <Section label="Follow-up Suggestions">
            {(item.follow_up_hint || item.follow_up).map((fq, i) => (
              <View key={i} style={styles.followUpItem}>
                <Text style={styles.followUpText}>
                  {typeof fq === 'string' ? fq : fq.text || fq.trigger || ''}
                </Text>
              </View>
            ))}
          </Section>
        )}

        {/* 리액션 안내 */}
        {isReaction && (
          <View style={styles.reactionHint}>
            <Text style={styles.reactionHintText}>
              💡 A transition phrase to naturally move to the next question.
            </Text>
          </View>
        )}

        {/* AI 수정 이유 */}
        {revisionReason ? (
          <Section label="AI Revision Reason">
            <View style={styles.whyBox}>
              <Text style={styles.whyLabel}>✦ </Text>
              <Text style={styles.whyText}>{revisionReason}</Text>
            </View>
          </Section>
        ) : null}

        {/* AI 수정 지시 */}
        <Section label="AI Edit Instructions">
          <TextInput
            style={[styles.insetBox, styles.aiInput]}
            value={aiInstruction}
            onChangeText={setAiInstruction}
            placeholder={aiPlaceholder}
            placeholderTextColor={colors.placeholder}
            multiline
          />
        </Section>

        {/* 버튼 행 */}
        <View style={styles.btnRow}>
          <GradientButton
            label={isAiLoading ? 'Editing...' : '✦ Edit with AI'}
            onPress={handleAiEdit}
            loading={isAiLoading}
            disabled={!aiInstruction.trim()}
            small
            style={{ flex: 1 }}
          />
          <TouchableOpacity
            style={[styles.ghostBtn, { flex: 1 }]}
            onPress={() => {
              if (isEditing) setEditText(item.text); // 취소 시 원래 텍스트로 리셋
              setIsEditing((v) => !v);
            }}
          >
            {isEditing
              ? <X size={16} color={colors.textSecondary} />
              : <Pencil size={16} color={colors.textSecondary} />
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => {
              if (isHidingRef.current) return;
              isHidingRef.current = true;
              setTimeout(() => { isHidingRef.current = false; }, 1000);
              onUpdate?.({ deleted: true });
            }}
            title="삭제"
          >
            {item.hidden
              ? <Eye size={16} color={colors.primaryMid} />
              : <EyeOff size={16} color={colors.primaryMid} />
            }
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── 섹션 헤더 래퍼 ──────────────────────────────────────────
function Section({ label, children }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    overflow: 'hidden',
  },

  // 헤더
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accentBar: {
    width: 2,
    height: 14,
    borderRadius: 1,
  },
  panelLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  panelBody: {
    padding: spacing.md,
    gap: spacing.md,
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // inset 박스 (현재 텍스트, AI 입력)
  insetBox: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    shadowColor: '#C5D1E0',
    shadowOffset: { width: -1, height: -1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  currentText: { ...textStyles.bodyS, color: colors.textPrimary, lineHeight: 20 },
  aiInput: {
    ...textStyles.bodyS,
    color: colors.textPrimary,
    minHeight: 44,
    textAlignVertical: 'top',
  },

  // 왜 이 질문
  whyBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  whyLabel: { ...textStyles.caption, color: colors.primaryEnd, fontWeight: '600' },
  whyText: { ...textStyles.caption, color: colors.textSecondary, lineHeight: 18, flex: 1 },
  enNoteLabel: { ...textStyles.caption, color: colors.textDisabled, fontWeight: '600' },
  enNoteText: { ...textStyles.caption, color: colors.textDisabled, lineHeight: 17, flex: 1, fontSize: 11 },
  translatedNoteLabel: { ...textStyles.caption, color: colors.textDisabled, fontWeight: '600', marginBottom: 4 },

  // 후속 질문
  followUpItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryMid,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  followUpText: { ...textStyles.caption, color: colors.textSecondary, lineHeight: 18 },

  // 리액션 안내
  reactionHint: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    padding: spacing.sm,
  },
  reactionHintText: { ...textStyles.caption, color: colors.textSecondary, lineHeight: 18 },

  // 버튼
  btnRow: { flexDirection: 'row', gap: spacing.xs },
  ghostBtn: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostBtnText: { ...textStyles.caption, color: colors.textSecondary },
  deleteBtn: {
    height: 36,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteBtnText: { ...textStyles.caption, color: colors.primaryMid },
});