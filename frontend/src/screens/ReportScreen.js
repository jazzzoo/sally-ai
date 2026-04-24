import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { reportsApi } from '../api/client';
import { colors, spacing, radius, textStyles } from '../theme';

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS      = 60000;
const AUTO_RETRY_MS    = 30000;

export default function ReportScreen({ route, navigation }) {
  const { reportId } = route.params;

  useFocusEffect(
    React.useCallback(() => {
      if (typeof document !== 'undefined') document.title = 'Sally - Report';
    }, [])
  );

  const [report, setReport]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const pollRef         = useRef(null);
  const elapsedRef      = useRef(0);
  const autoRetryRef    = useRef(null);
  const autoRetryDoneRef = useRef(false);

  async function fetchReport() {
    try {
      const res = await reportsApi.get(reportId);
      const data = res?.data;
      setReport(data);
      setLoading(false);
      if (data?.status === 'completed' || data?.status === 'failed') {
        stopPolling();
        setIsTimedOut(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to load report.');
      setLoading(false);
      stopPolling();
    }
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    elapsedRef.current = 0;
    setIsTimedOut(false);
    pollRef.current = setInterval(() => {
      elapsedRef.current += POLL_INTERVAL_MS;
      if (elapsedRef.current >= POLL_MAX_MS) {
        stopPolling();
        setIsTimedOut(true);
        if (!autoRetryDoneRef.current) {
          autoRetryDoneRef.current = true;
          autoRetryRef.current = setTimeout(() => {
            fetchReport();
            startPolling();
          }, AUTO_RETRY_MS);
        }
        return;
      }
      fetchReport();
    }, POLL_INTERVAL_MS);
  }

  function handleRefresh() {
    if (autoRetryRef.current) {
      clearTimeout(autoRetryRef.current);
      autoRetryRef.current = null;
    }
    autoRetryDoneRef.current = false;
    fetchReport();
    startPolling();
  }

  useEffect(() => {
    fetchReport();
    startPolling();
    return () => {
      stopPolling();
      if (autoRetryRef.current) clearTimeout(autoRetryRef.current);
    };
  }, [reportId]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Interview Report</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && !error && report && (
          report.status === 'completed'
            ? <CompletedReport report={report} />
            : report.status === 'failed'
              ? <ErrorState message="Report generation failed. Please try again later." />
              : isTimedOut
                ? <TimeoutState onRefresh={handleRefresh} />
                : <PendingState />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── States ─────────────────────────────────────────────────────

function LoadingState() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>Loading report...</Text>
    </View>
  );
}

function PendingState() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.primaryMid} />
      <Text style={styles.loadingText}>Analyzing your interview...</Text>
      <Text style={styles.loadingSubtext}>This usually takes about 30 seconds.</Text>
      <View style={styles.skeletonSection}>
        <View style={[styles.skeletonLine, { width: '55%', height: 18 }]} />
        <View style={[styles.skeletonLine, { width: '85%' }]} />
        <View style={[styles.skeletonLine, { width: '70%' }]} />
      </View>
      <View style={styles.skeletonSection}>
        <View style={[styles.skeletonLine, { width: '45%', height: 18 }]} />
        <View style={[styles.skeletonLine, { width: '90%' }]} />
        <View style={[styles.skeletonLine, { width: '65%' }]} />
      </View>
    </View>
  );
}

function TimeoutState({ onRefresh }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.primaryMid} />
      <Text style={styles.timeoutTitle}>Still generating your report...</Text>
      <Text style={styles.timeoutSubtext}>
        This is taking longer than usual.{'\n'}Please check back in a few minutes.
      </Text>
      <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

function ErrorState({ message }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorIcon}>✕</Text>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMessage}>{message}</Text>
    </View>
  );
}

// ── Completed Report ───────────────────────────────────────────

function CompletedReport({ report }) {
  const r = report?.result || {};

  return (
    <View style={styles.reportContainer}>
      <View style={styles.respondentRow}>
        <Text style={styles.respondentName}>{report?.respondent_name || 'Anonymous'}</Text>
        {(report?.completed_at || report?.created_at) && (
          <Text style={styles.respondentDate}>
            {'  ·  '}
            {(() => { const d = new Date(report.completed_at || report.created_at); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`; })()}
          </Text>
        )}
      </View>

      {/* 1. Respondent Context */}
      {r?.respondent_context && (
        <Section title="Respondent">
          <View style={styles.rowWrap}>
            <Text style={styles.roleText}>{r.respondent_context?.role ?? ''}</Text>
            {r.respondent_context?.segment_fit && (
              <SegmentBadge fit={r.respondent_context.segment_fit} />
            )}
          </View>
          {r.respondent_context?.context_summary ? (
            <Text style={styles.bodyText}>{r.respondent_context.context_summary}</Text>
          ) : null}
        </Section>
      )}

      {/* 2. Problem Situations */}
      {(r?.problem_situations?.length ?? 0) > 0 && (
        <Section title="Problem Situations">
          {r.problem_situations.map((s, i) => (
            <View key={i} style={styles.situationCard}>
              <Text style={styles.situationTrigger}>{s?.trigger ?? ''}</Text>
              {s?.job_context ? (
                <Text style={styles.bodyText}>{s.job_context}</Text>
              ) : null}
              {s?.quote ? (
                <Text style={styles.quote}>"{s.quote}"</Text>
              ) : null}
            </View>
          ))}
        </Section>
      )}

      {/* 3. Problem Verdict */}
      {r?.problem_verdict && (
        <Section title="Problem Verdict">
          <View style={styles.verdictRow}>
            <VerdictBadge status={r.problem_verdict?.status} />
            {r.problem_verdict?.evidence_level && (
              <EvidenceBadge level={r.problem_verdict.evidence_level} />
            )}
          </View>
          {r.problem_verdict?.reason ? (
            <Text style={styles.bodyText}>{r.problem_verdict.reason}</Text>
          ) : null}
        </Section>
      )}

      {/* 3. Top Pains */}
      {(r?.top_pains?.length ?? 0) > 0 && (
        <Section title="Top Pains">
          {r.top_pains.map((pain, i) => (
            <View key={i} style={styles.painCard}>
              <Text style={styles.painTitle}>{pain?.title ?? ''}</Text>
              {pain?.description ? (
                <Text style={styles.bodyText}>{pain.description}</Text>
              ) : null}
              <View style={styles.metaRow}>
                {pain?.impact ? (
                  <Text style={styles.metaChip}>⚡ {pain.impact}</Text>
                ) : null}
                {pain?.frequency ? (
                  <Text style={styles.metaChip}>↻ {pain.frequency}</Text>
                ) : null}
              </View>
              {pain?.quote ? (
                <Text style={styles.quote}>"{pain.quote}"</Text>
              ) : null}
            </View>
          ))}
        </Section>
      )}

      {/* 4. Current Workarounds */}
      {(r?.current_workarounds?.length ?? 0) > 0 && (
        <Section title="Current Workarounds">
          {r.current_workarounds.map((w, i) => (
            <View key={i} style={styles.workaroundCard}>
              <Text style={styles.workaroundMethod}>{w?.method ?? ''}</Text>
              {w?.why_used ? (
                <Text style={styles.bodyText}>{w.why_used}</Text>
              ) : null}
              {w?.complaint ? (
                <Text style={styles.complaint}>✕ {w.complaint}</Text>
              ) : null}
            </View>
          ))}
        </Section>
      )}

      {/* 5. Consequences */}
      {(r?.consequences?.length ?? 0) > 0 && (
        <Section title="Consequences">
          {r.consequences.map((c, i) => (
            <View key={i} style={styles.consequenceRow}>
              {c?.type ? <ConsequenceTypeBadge type={c.type} /> : null}
              <View style={{ flex: 1, gap: 4 }}>
                {c?.detail ? (
                  <Text style={styles.bodyText}>{c.detail}</Text>
                ) : null}
                {c?.quote ? (
                  <Text style={styles.quote}>"{c.quote}"</Text>
                ) : null}
              </View>
            </View>
          ))}
        </Section>
      )}

      {/* 6. Evidence Quotes */}
      {(r?.evidence_quotes?.filter(Boolean).length ?? 0) > 0 && (
        <Section title="Key Quotes">
          {r.evidence_quotes.filter(Boolean).map((q, i) => (
            <Text key={i} style={styles.evidenceQuote}>"{q}"</Text>
          ))}
        </Section>
      )}

      {/* 7. Next Actions */}
      {(r?.next_actions?.filter(Boolean).length ?? 0) > 0 && (
        <Section title="Next Actions">
          {r.next_actions.filter(Boolean).map((action, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.listBullet}>→</Text>
              <Text style={styles.listText}>{action}</Text>
            </View>
          ))}
        </Section>
      )}

      {/* 8. Next Questions */}
      {(r?.next_questions?.filter(Boolean).length ?? 0) > 0 && (
        <Section title="Questions to Explore Next">
          {r.next_questions.filter(Boolean).map((q, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.listBullet}>{i + 1}.</Text>
              <Text style={styles.listText}>{q}</Text>
            </View>
          ))}
        </Section>
      )}
    </View>
  );
}

// ── Badge Components ───────────────────────────────────────────

function VerdictBadge({ status }) {
  const map = {
    confirmed: { label: 'Confirmed ✓', bg: '#E8F5E9', color: '#2E7D32' },
    mixed:     { label: 'Mixed',        bg: '#FFF8E1', color: '#F57C00' },
    rejected:  { label: 'Not validated', bg: '#FFEBEE', color: '#C62828' },
  };
  const cfg = map[status] || map.mixed;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function EvidenceBadge({ level }) {
  const map = {
    strong: { label: 'Strong evidence', bg: '#E3F2FD', color: '#1565C0' },
    medium: { label: 'Medium evidence', bg: '#F3E5F5', color: '#6A1B9A' },
    weak:   { label: 'Weak evidence',   bg: '#FAFAFA', color: '#757575' },
  };
  const cfg = map[level] || map.weak;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function SegmentBadge({ fit }) {
  const map = {
    high:   { label: 'Target fit ↑', bg: '#E8F5E9', color: '#2E7D32' },
    medium: { label: 'Partial fit',  bg: '#FFF8E1', color: '#F57C00' },
    low:    { label: 'Low fit ↓',   bg: '#FFEBEE', color: '#C62828' },
  };
  const cfg = map[fit] || map.medium;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function ConsequenceTypeBadge({ type }) {
  const map = {
    time:    { label: 'Time',    color: '#1565C0', bg: '#E3F2FD' },
    stress:  { label: 'Stress',  color: '#6A1B9A', bg: '#F3E5F5' },
    quality: { label: 'Quality', color: '#E65100', bg: '#FFF3E0' },
    money:   { label: 'Money',   color: '#1B5E20', bg: '#E8F5E9' },
    delay:   { label: 'Delay',   color: '#BF360C', bg: '#FBE9E7' },
  };
  const cfg = map[type] || { label: type, color: colors.textSecondary, bg: colors.border };
  return (
    <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 16, color: colors.primary, fontWeight: '500' },
  topTitle: { ...textStyles.h3, color: colors.textPrimary },

  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },

  // ── States
  centered: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.sm,
  },
  loadingText:    { ...textStyles.body,   color: colors.textSecondary, marginTop: spacing.md },
  loadingSubtext: { ...textStyles.caption, color: colors.textDisabled },
  timeoutTitle: { ...textStyles.body, color: colors.textPrimary, fontWeight: '600', marginTop: spacing.md, textAlign: 'center' },
  timeoutSubtext: { ...textStyles.caption, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  refreshBtn: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  refreshBtnText: { ...textStyles.bodyS, color: colors.primary, fontWeight: '600' },
  errorIcon:    { fontSize: 32, color: colors.error },
  errorTitle:   { ...textStyles.h3,   color: colors.textPrimary },
  errorMessage: { ...textStyles.bodyS, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.lg },

  skeletonSection: {
    width: '100%',
    gap: spacing.xs,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: colors.border,
    borderRadius: 6,
    opacity: 0.6,
  },

  // ── Report layout
  reportContainer: { gap: spacing.md },
  respondentRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: spacing.xs },
  respondentName: { ...textStyles.h2, color: colors.textPrimary },
  respondentDate: { ...textStyles.bodyS, color: colors.textDisabled, marginLeft: 4 },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...textStyles.caption,
    color: colors.textDisabled,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Verdict
  verdictRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rowWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },

  // ── Badges
  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // ── Situation cards
  situationCard: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryMid,
    paddingLeft: spacing.sm,
    gap: 4,
  },
  situationTrigger: { ...textStyles.bodyS, color: colors.textPrimary, fontWeight: '700' },

  // ── Pain cards
  painCard: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryEnd,
    paddingLeft: spacing.sm,
    gap: 6,
  },
  painTitle: { ...textStyles.bodyS, color: colors.textPrimary, fontWeight: '700' },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metaChip:  { ...textStyles.caption, color: colors.textDisabled, backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  // ── Workaround cards
  workaroundCard: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
    gap: 4,
  },
  workaroundMethod: { ...textStyles.bodyS, color: colors.textPrimary, fontWeight: '700' },
  complaint: { ...textStyles.bodyS, color: colors.primaryEnd, fontStyle: 'italic' },

  // ── Consequence rows
  consequenceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },

  // ── Evidence quotes
  evidenceQuote: {
    ...textStyles.bodyS,
    color: colors.textSecondary,
    fontStyle: 'italic',
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryMid,
    paddingLeft: spacing.sm,
    lineHeight: 22,
  },

  // ── Shared text
  bodyText: { ...textStyles.bodyS, color: colors.textSecondary, lineHeight: 22 },
  roleText: { ...textStyles.bodyS, color: colors.textPrimary, fontWeight: '600' },
  quote: {
    ...textStyles.bodyS,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
    marginTop: 2,
  },

  // ── Next actions / questions
  listItem: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  listBullet: { ...textStyles.bodyS, color: colors.primary, fontWeight: '600', minWidth: 20 },
  listText: { ...textStyles.bodyS, color: colors.textSecondary, flex: 1, lineHeight: 22 },
});
