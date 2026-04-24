// frontend/src/components/QuestionsPanel.js
// QuestionsScreen UI를 공유 컴포넌트로 추출
// 데스크탑: CreateScreen 우측 패널에서 렌더
// 모바일:   QuestionsScreen에서 렌더

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, Clipboard,
  Share, Pressable, Modal, Platform, Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import InterviewLinkModal from './InterviewLinkModal';

import NeuCard from './NeuCard';
import SlidePanel from './SlidePanel';
import EditPanel from './EditPanel';
import GradientButton from './GradientButton';
import ModalDialog from './ModalDialog';
import useStore from '../store/useStore';
import { questionListsApi, interviewSessionsApi, reportsApi } from '../api/client';
import { colors, spacing, radius, textStyles, shadows } from '../theme';
import { Copy, Share2, List } from 'lucide-react-native';


export default function QuestionsPanel({ scrollRef, style }) {
  const navigation = useNavigation();
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
  const [interviewSessions, setInterviewSessions] = useState([]);
  const [reports, setReports] = useState({});
  const [linkModal, setLinkModal] = useState({ visible: false, url: null });
  const [closingSessionId, setClosingSessionId] = useState(null);
  const [closeConfirmVisible, setCloseConfirmVisible] = useState(false);
  const [interviewPanelOpen, setInterviewPanelOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;

  function openInterviewPanel() {
    setInterviewPanelOpen(true);
    Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  }

  function closeInterviewPanel() {
    Animated.timing(slideAnim, { toValue: 300, duration: 250, useNativeDriver: true })
      .start(() => setInterviewPanelOpen(false));
  }

  const toggle = useCallback(
    (id) => setExpanded((prev) => (prev === id ? null : id)),
    []
  );

  useEffect(() => {
    if (!listId) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await interviewSessionsApi.list(listId);
        if (cancelled) return;
        const sessions = res.data || [];
        setInterviewSessions(sessions);
        const completedIds = sessions
          .filter((s) => s.status === 'completed')
          .map((s) => s.id);
        if (completedIds.length === 0) return;
        const rptRes = await reportsApi.list();
        if (cancelled) return;
        const rptMap = {};
        for (const r of (rptRes.data || [])) {
          if (completedIds.includes(r.interview_session_id)) {
            rptMap[r.interview_session_id] = r;
          }
        }
        setReports(rptMap);
      } catch (_) {}
    }
    load();
    return () => { cancelled = true; };
  }, [listId]);

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

  // 응답자 1명 = 링크 1개, 항상 새로 생성
  async function handleCloseLink() {
    if (!closingSessionId) return;
    setCloseConfirmVisible(false);
    try {
      await interviewSessionsApi.deactivate(closingSessionId);
      setInterviewSessions((prev) =>
        prev.map((s) => s.id === closingSessionId ? { ...s, status: 'abandoned' } : s)
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to close the link. Please try again.');
    } finally {
      setClosingSessionId(null);
    }
  }

  async function handleFinalizePress() {
    if (!listId) return;
    setIsLoadingLink(true);
    try {
      const created = await interviewSessionsApi.create(listId);
      setShareLink(created.data.url);
      setShowLinkModal(true);
      setInterviewSessions((prev) => [created.data, ...prev]);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create interview link.');
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
            <TouchableOpacity style={styles.iconBtn} onPress={openInterviewPanel} title="Interviews">
              <List size={20} color={interviewSessions.length > 0 ? colors.primaryEnd : colors.textSecondary} />
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

      {/* 인터뷰 현황 슬라이드 패널 */}
      <Modal
        visible={interviewPanelOpen}
        transparent
        animationType="none"
        onRequestClose={closeInterviewPanel}
      >
        <View style={styles.slideOverlayContainer}>
          <Pressable style={styles.slideOverlay} onPress={closeInterviewPanel} />
          <Animated.View style={[styles.slidePanel, { transform: [{ translateX: slideAnim }] }]}>
            <View style={styles.slidePanelHeader}>
              <Text style={styles.slidePanelTitle}>Interviews</Text>
              <Pressable onPress={closeInterviewPanel} style={styles.slidePanelClose}>
                <Text style={styles.slidePanelCloseText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.slidePanelScroll} contentContainerStyle={styles.slidePanelContent}>
              {interviewSessions.length === 0 ? (
                <Text style={styles.slidePanelEmpty}>No interviews yet.{'\n'}Tap "Finalize → Share Link" to create one.</Text>
              ) : (
                interviewSessions.map((s) => {
                  const report = reports[s.id];
                  const isCompleted = s.status === 'completed';
                  const isActive = s.status === 'active' || s.status === 'in_progress';
                  return (
                    <Pressable
                      key={s.id}
                      style={({ pressed }) => [styles.sessionRow, pressed && { opacity: 0.75 }]}
                      onPress={() => {
                        if (isCompleted && report?.status === 'completed') {
                          closeInterviewPanel();
                          navigation.navigate('Report', { reportId: report.id });
                          return;
                        }
                        if (isActive) {
                          closeInterviewPanel();
                          setLinkModal({
                            visible: true,
                            url: s.link_token
                              ? `https://sally-ai-gamma.vercel.app/interview/${s.link_token}`
                              : s.url || null,
                          });
                          return;
                        }
                      }}
                    >
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionName}>{s.respondent_name || 'Pending...'}</Text>
                        <Text style={styles.sessionDate}>{new Date(s.created_at).toLocaleDateString()}</Text>
                      </View>
                      <View style={styles.sessionRight}>
                        <ReportBadge status={s.status} reportStatus={report?.status} />
                        {isActive && (
                          <TouchableOpacity
                            style={styles.closeLinkBtn}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              setClosingSessionId(s.id);
                              setCloseConfirmVisible(true);
                            }}
                          >
                            <Text style={styles.closeLinkText}>Close Link</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

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

      {/* Close Link 확인 모달 */}
      <Modal
        visible={closeConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCloseConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Close this interview link?</Text>
            <Text style={styles.modalSubtitle}>
              Respondents won't be able to access it anymore.
            </Text>
            <TouchableOpacity
              style={[styles.modalBtnPrimary, { backgroundColor: '#C62828' }]}
              onPress={handleCloseLink}
            >
              <Text style={styles.modalBtnPrimaryText}>Close Link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalBtnClose}
              onPress={() => setCloseConfirmVisible(false)}
            >
              <Text style={styles.modalBtnCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 질문 리스트 공유 (Share2 아이콘 → 팀원 공유용) */}
      <InterviewLinkModal
        visible={linkModal.visible}
        url={linkModal.url}
        onClose={() => setLinkModal({ visible: false, url: null })}
      />

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

// ── 리포트 상태 배지 ───────────────────────────────────────────
function ReportBadge({ status, reportStatus }) {
  if (status !== 'completed') {
    const isActive = status === 'active' || status === 'in_progress';
    const label = isActive ? 'Active' : 'Closed';
    const bg = isActive ? '#E8F4FD' : '#F5F5F5';
    return <View style={[styles.badge, { backgroundColor: bg }]}><Text style={[styles.badgeText, { color: colors.textSecondary }]}>{label}</Text></View>;
  }
  if (!reportStatus || reportStatus === 'pending' || reportStatus === 'generating') {
    return <View style={[styles.badge, { backgroundColor: '#FFF8E1' }]}><Text style={[styles.badgeText, { color: colors.textSecondary }]}>Generating...</Text></View>;
  }
  if (reportStatus === 'failed') {
    return <View style={[styles.badge, { backgroundColor: '#FFEBEE' }]}><Text style={[styles.badgeText, { color: colors.textSecondary }]}>Failed</Text></View>;
  }
  return <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}><Text style={[styles.badgeText, { color: colors.textSecondary }]}>Report Ready</Text></View>;
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

  // ── 인터뷰 슬라이드 패널 ─────────────────────────────────────
  slideOverlayContainer: {
    flex: 1,
  },
  slideOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  slidePanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '85%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.2,
    elevation: 10,
  },
  slidePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 48,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  slidePanelTitle: {
    ...textStyles.body,
    fontSize: 26,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  slidePanelClose: {
    padding: 8,
  },
  slidePanelCloseText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  slidePanelScroll: {
    flex: 1,
  },
  slidePanelContent: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  slidePanelEmpty: {
    ...textStyles.bodyS,
    color: colors.textDisabled,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 22,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  sessionInfo: { flex: 1 },
  sessionName: { ...textStyles.bodyS, color: colors.textSecondary, fontWeight: '500' },
  sessionDate: { ...textStyles.caption, color: colors.textDisabled, marginTop: 2 },
  sessionRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  viewReportBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  viewReportText: { fontSize: 12, fontWeight: '600', color: colors.white },
  closeLinkBtn: {
    backgroundColor: '#FFF0F0',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  closeLinkText: { fontSize: 11, fontWeight: '600', color: '#C62828' },
});
