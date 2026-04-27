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
const POLL_MAX_MS      = 90000;

export default function AggregateReportScreen({ route, navigation }) {
  const { questionListId } = route.params;

  useFocusEffect(
    React.useCallback(() => {
      if (typeof document !== 'undefined') document.title = 'Nitor8 - Overall Report';
    }, [])
  );

  const [report, setReport]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const pollRef    = useRef(null);
  const elapsedRef = useRef(0);

  async function fetchReport() {
    try {
      const res = await reportsApi.getAggregate(questionListId);
      const data = res?.data;
      setReport(data);
      setLoading(false);
      if (data?.status === 'completed' || data?.status === 'failed') stopPolling();
    } catch (err) {
      setError(err.message || 'Failed to load report.');
      setLoading(false);
      stopPolling();
    }
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling() {
    stopPolling();
    elapsedRef.current = 0;
    pollRef.current = setInterval(() => {
      elapsedRef.current += POLL_INTERVAL_MS;
      if (elapsedRef.current >= POLL_MAX_MS) { stopPolling(); setIsTimedOut(true); return; }
      fetchReport();
    }, POLL_INTERVAL_MS);
  }

  useEffect(() => {
    fetchReport();
    startPolling();
    return () => stopPolling();
  }, [questionListId]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Overall Report</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && !error && report && (
          report.status === 'completed'
            ? <CompletedAggregateReport report={report} />
            : report.status === 'failed'
              ? <ErrorState message="Report generation failed. Please try again." />
              : isTimedOut
                ? <TimeoutState onRefresh={() => { setIsTimedOut(false); fetchReport(); startPolling(); }} />
                : <PendingState />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Completed Aggregate Report ──────────────────────────────────

function CompletedAggregateReport({ report }) {
  const r = report?.result || {};

  return (
    <View style={styles.reportContainer}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{r.respondent_count ?? '?'} respondents</Text>
        </View>
        {r.completed_at && (
          <Text style={styles.dateText}>
            {(() => { const d = new Date(report.completed_at); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`; })()}
          </Text>
        )}
      </View>

      {/* Decision Recommendation */}
      {r.decision_recommendation && (
        <DecisionBadge recommendation={r.decision_recommendation} />
      )}

      {/* Overall Verdict */}
      {r.overall_verdict && (
        <Section title="Overall Verdict">
          <View style={styles.verdictRow}>
            <VerdictBadge status={r.overall_verdict.status} />
            {r.overall_verdict.evidence_level && (
              <EvidenceBadge level={r.overall_verdict.evidence_level} />
            )}
          </View>
          {r.overall_verdict.reason ? (
            <Text style={styles.bodyText}>{r.overall_verdict.reason}</Text>
          ) : null}
        </Section>
      )}

      {/* Pattern Summary */}
      {r.pattern_summary ? (
        <Section title="Pattern Summary">
          <Text style={styles.bodyText}>{r.pattern_summary}</Text>
        </Section>
      ) : null}

      {/* Recurring Pains */}
      {(r.recurring_pains?.length ?? 0) > 0 && (
        <Section title="Recurring Pains">
          {r.recurring_pains.map((pain, i) => (
            <View key={i} style={styles.painCard}>
              <View style={styles.painHeader}>
                <Text style={styles.painTitle}>{pain.title ?? ''}</Text>
                {pain.frequency ? <Text style={styles.freqChip}>{pain.frequency}</Text> : null}
              </View>
              {pain.description ? <Text style={styles.bodyText}>{pain.description}</Text> : null}
              {pain.representative_quote ? (
                <Text style={styles.quote}>"{pain.representative_quote}"</Text>
              ) : null}
            </View>
          ))}
        </Section>
      )}

      {/* Common Workarounds */}
      {(r.common_workarounds?.length ?? 0) > 0 && (
        <Section title="Common Workarounds">
          {r.common_workarounds.map((w, i) => (
            <View key={i} style={styles.workaroundCard}>
              <View style={styles.painHeader}>
                <Text style={styles.workaroundMethod}>{w.method ?? ''}</Text>
                {w.frequency ? <Text style={styles.freqChip}>{w.frequency}</Text> : null}
              </View>
              {w.complaint ? <Text style={styles.complaint}>✕ {w.complaint}</Text> : null}
            </View>
          ))}
        </Section>
      )}

      {/* Segment Insights */}
      {r.segment_insights ? (
        <Section title="Segment Insights">
          <Text style={styles.bodyText}>{r.segment_insights}</Text>
        </Section>
      ) : null}

      {/* Key Evidence Quotes */}
      {(r.key_evidence_quotes?.filter(Boolean).length ?? 0) > 0 && (
        <Section title="Key Evidence Quotes">
          {r.key_evidence_quotes.filter(Boolean).map((q, i) => (
            <Text key={i} style={styles.evidenceQuote}>"{q}"</Text>
          ))}
        </Section>
      )}

      {/* Next Actions */}
      {(r.next_actions?.filter(Boolean).length ?? 0) > 0 && (
        <Section title="Next Actions">
          {r.next_actions.filter(Boolean).map((action, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.listBullet}>→</Text>
              <Text style={styles.listText}>{action}</Text>
            </View>
          ))}
        </Section>
      )}

      {/* Open Questions */}
      {(r.open_questions?.filter(Boolean).length ?? 0) > 0 && (
        <Section title="Open Questions">
          {r.open_questions.filter(Boolean).map((q, i) => (
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

// ── Badge Components ────────────────────────────────────────────

function DecisionBadge({ recommendation }) {
  const map = {
    continue:         { label: 'Continue Interviewing',      bg: colors.surface, color: colors.primary },
    narrow_icp:       { label: 'Narrow ICP',                 bg: colors.surface, color: colors.primaryMid },
    pivot:            { label: 'Pivot',                      bg: colors.surface, color: colors.primaryEnd },
    move_to_solution: { label: 'Move to Solution Interview', bg: colors.surface, color: colors.textSecondary },
  };
  const cfg = map[recommendation] || { label: recommendation, bg: colors.border, color: colors.textSecondary };
  return (
    <View style={[styles.decisionCard, { backgroundColor: cfg.bg }]}>
      <Text style={styles.decisionLabel}>Recommendation</Text>
      <Text style={[styles.decisionValue, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function VerdictBadge({ status }) {
  const map = {
    confirmed: { label: 'Confirmed ✓',   bg: colors.surface, color: colors.primary },
    mixed:     { label: 'Mixed',         bg: colors.surface, color: colors.primaryMid },
    rejected:  { label: 'Not validated', bg: colors.surface, color: colors.primaryEnd },
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
    strong: { label: 'Strong evidence', bg: colors.background, color: colors.textSecondary },
    medium: { label: 'Medium evidence', bg: colors.background, color: colors.textSecondary },
    weak:   { label: 'Weak evidence',   bg: colors.background, color: colors.textDisabled },
  };
  const cfg = map[level] || map.weak;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
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

// ── State Components ────────────────────────────────────────────

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
      <Text style={styles.loadingText}>Synthesizing interviews...</Text>
      <Text style={styles.loadingSubtext}>This usually takes about 30–60 seconds.</Text>
    </View>
  );
}

function TimeoutState({ onRefresh }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.primaryMid} />
      <Text style={styles.loadingText}>Still generating...</Text>
      <Text style={styles.loadingSubtext}>Please check back in a moment.</Text>
      <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

function ErrorState({ message }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMessage}>{message}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────

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
  backBtn:  { width: 60 },
  backText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  topTitle: { ...textStyles.h3, color: colors.textSecondary },

  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },

  centered: { alignItems: 'center', paddingTop: spacing.xl * 2, gap: spacing.sm },
  loadingText:    { ...textStyles.body,    color: colors.textSecondary, marginTop: spacing.md },
  loadingSubtext: { ...textStyles.caption, color: colors.textDisabled },
  refreshBtn: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  refreshBtnText: { ...textStyles.bodyS, color: colors.primary, fontWeight: '600' },
  errorTitle:   { ...textStyles.h3,    color: colors.textSecondary },
  errorMessage: { ...textStyles.bodyS, color: colors.textSecondary, textAlign: 'center' },

  reportContainer: { gap: spacing.md },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  countBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.background },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  dateText: { ...textStyles.caption, color: colors.textDisabled },

  decisionCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  decisionLabel: { ...textStyles.caption, color: colors.textDisabled, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  decisionValue: { ...textStyles.h3, fontWeight: '700' },

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

  verdictRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },

  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  painCard: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryEnd,
    paddingLeft: spacing.sm,
    gap: 6,
  },
  painHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  painTitle: { ...textStyles.bodyS, color: colors.textSecondary, fontWeight: '700', flex: 1 },
  freqChip: {
    ...textStyles.caption,
    fontSize: 14,
    color: colors.textDisabled,
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },

  workaroundCard: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
    gap: 4,
  },
  workaroundMethod: { ...textStyles.bodyS, color: colors.textSecondary, fontWeight: '700', flex: 1 },
  complaint: { ...textStyles.bodyS, color: colors.primaryEnd, fontStyle: 'italic' },

  evidenceQuote: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryMid,
    paddingLeft: spacing.sm,
    lineHeight: 26,
  },

  listItem: { flexDirection: 'row', gap: spacing.xs },
  listBullet: { ...textStyles.caption, color: colors.textDisabled, width: 20, lineHeight: 29 },
  listText: { ...textStyles.caption, color: colors.textSecondary, flex: 1, lineHeight: 26 },

  bodyText: { ...textStyles.caption, color: colors.textSecondary, lineHeight: 26 },
  quote: { ...textStyles.caption, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 26, marginTop: 2 },
});
