import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { reportsApi } from '../api/client';
import { colors, spacing, radius, textStyles } from '../theme';

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS      = 60000;

export default function ReportScreen({ route, navigation }) {
  const { reportId } = route.params;
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const pollRef  = useRef(null);
  const elapsedRef = useRef(0);

  async function fetchReport() {
    try {
      const res = await reportsApi.get(reportId);
      const data = res?.data;
      setReport(data);
      setLoading(false);
      if (data?.status === 'completed' || data?.status === 'failed') {
        stopPolling();
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

  useEffect(() => {
    fetchReport();
    pollRef.current = setInterval(() => {
      elapsedRef.current += POLL_INTERVAL_MS;
      if (elapsedRef.current >= POLL_MAX_MS) {
        stopPolling();
        return;
      }
      fetchReport();
    }, POLL_INTERVAL_MS);
    return () => stopPolling();
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
              : <PendingState />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────

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
        <View style={[styles.skeletonLine, { width: '60%', height: 20 }]} />
        <View style={[styles.skeletonLine, { width: '90%' }]} />
        <View style={[styles.skeletonLine, { width: '75%' }]} />
      </View>
      <View style={styles.skeletonSection}>
        <View style={[styles.skeletonLine, { width: '50%', height: 20 }]} />
        <View style={[styles.skeletonLine, { width: '85%' }]} />
        <View style={[styles.skeletonLine, { width: '70%' }]} />
      </View>
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

function CompletedReport({ report }) {
  const r = report?.result || {};

  const verdictConfig = {
    confirmed: { label: 'Confirmed ✓', bg: '#E8F5E9', color: '#2E7D32' },
    mixed:     { label: 'Mixed signals', bg: '#FFF8E1', color: '#F57C00' },
    rejected:  { label: 'Not validated', bg: '#FFEBEE', color: '#C62828' },
  };
  const verdict = verdictConfig[r?.hypothesis_verdict] || verdictConfig.mixed;

  return (
    <View style={styles.reportContainer}>
      <Text style={styles.respondentName}>{report?.respondent_name || 'Anonymous'}</Text>

      {/* Hypothesis Verdict */}
      <Section title="Hypothesis">
        <View style={[styles.verdictCard, { backgroundColor: verdict.bg }]}>
          <Text style={[styles.verdictLabel, { color: verdict.color }]}>{verdict.label}</Text>
        </View>
      </Section>

      {/* Top Pains */}
      {(r?.top_pains?.length ?? 0) > 0 && (
        <Section title="Top Pains">
          {r.top_pains.map((pain, i) => (
            <View key={i} style={styles.painCard}>
              <Text style={styles.painTitle}>{pain?.title ?? ''}</Text>
              {pain?.quote ? <Text style={styles.painQuote}>"{pain.quote}"</Text> : null}
              {pain?.frequency ? <Text style={styles.painFrequency}>{pain.frequency}</Text> : null}
            </View>
          ))}
        </Section>
      )}

      {/* Current Alternatives */}
      {(r?.current_alternatives?.length ?? 0) > 0 && (
        <Section title="Current Alternatives">
          {r.current_alternatives.map((alt, i) => (
            <View key={i} style={styles.altCard}>
              <Text style={styles.altTool}>{alt?.tool ?? ''}</Text>
              {alt?.complaint ? <Text style={styles.altComplaint}>{alt.complaint}</Text> : null}
            </View>
          ))}
        </Section>
      )}

      {/* WTP Summary — only shown if non-empty */}
      {r?.wtp_summary ? (
        <Section title="Willingness to Pay">
          <Text style={styles.bodyText}>{r.wtp_summary}</Text>
        </Section>
      ) : null}

      {/* Next Actions */}
      {(r?.next_actions?.length ?? 0) > 0 && (
        <Section title="Next Actions">
          {r.next_actions.filter(Boolean).map((action, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.listBullet}>→</Text>
              <Text style={styles.listText}>{action}</Text>
            </View>
          ))}
        </Section>
      )}

      {/* Next Questions */}
      {(r?.next_questions?.length ?? 0) > 0 && (
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

  centered: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.sm,
  },
  loadingText: { ...textStyles.body, color: colors.textSecondary, marginTop: spacing.md },
  loadingSubtext: { ...textStyles.caption, color: colors.textDisabled },

  errorIcon: { fontSize: 32, color: colors.error },
  errorTitle: { ...textStyles.h3, color: colors.textPrimary },
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

  reportContainer: { gap: spacing.md },
  respondentName: { ...textStyles.h2, color: colors.textPrimary, marginBottom: spacing.xs },

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

  verdictCard: {
    borderRadius: radius.sm,
    padding: spacing.sm,
    alignSelf: 'flex-start',
  },
  verdictLabel: { fontSize: 15, fontWeight: '700' },

  painCard: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryEnd,
    paddingLeft: spacing.sm,
    gap: 4,
  },
  painTitle: { ...textStyles.bodyS, color: colors.textPrimary, fontWeight: '600' },
  painQuote: { ...textStyles.bodyS, color: colors.textSecondary, fontStyle: 'italic' },
  painFrequency: { ...textStyles.caption, color: colors.textDisabled },

  altCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  altTool: { ...textStyles.bodyS, color: colors.primary, fontWeight: '600', minWidth: 80 },
  altComplaint: { ...textStyles.bodyS, color: colors.textSecondary, flex: 1 },

  bodyText: { ...textStyles.bodyS, color: colors.textSecondary, lineHeight: 22 },

  listItem: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  listBullet: { ...textStyles.bodyS, color: colors.primary, fontWeight: '600', minWidth: 20 },
  listText: { ...textStyles.bodyS, color: colors.textSecondary, flex: 1, lineHeight: 22 },
});
