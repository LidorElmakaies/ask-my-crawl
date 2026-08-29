import { useEffect } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import GlowCard from '../../src/components/GlowCard';
import SpaceBackground from '../../src/components/SpaceBackground';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { fetchJobs } from '../../src/store/slices/jobsSlice';

export default function HistoryScreen() {
  const dispatch = useDispatch();
  const { items: jobs, status, error } = useSelector((state) => state.jobs);
  const { colors } = useAppTheme();

  useEffect(() => {
    dispatch(fetchJobs());
  }, [dispatch]);

  const onRefresh = () => {
    dispatch(fetchJobs());
  };

  return (
    <SpaceBackground>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={status === 'loading' && jobs.length > 0}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.text }]}>Crawl History</Text>
          <Text style={[styles.subheading, { color: colors.textMuted }]}>
            Submitted crawl requests and real-time synthesized answers
          </Text>
        </View>

        {/* Loading State */}
        {status === 'loading' && jobs.length === 0 && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.statusText, { color: colors.textMuted }]}>
              Loading jobs...
            </Text>
          </View>
        )}

        {/* Error State */}
        {status === 'failed' && jobs.length === 0 && (
          <GlowCard style={styles.errorCard}>
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={24} color={colors.error} />
              <Text style={[styles.errorTitle, { color: colors.error }]}>
                Failed to load history
              </Text>
            </View>
            <Text style={[styles.errorBody, { color: colors.text }]}>{error}</Text>
            <TouchableOpacity
              onPress={() => dispatch(fetchJobs())}
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.retryText, { color: colors.onPrimary }]}>
                Retry
              </Text>
            </TouchableOpacity>
          </GlowCard>
        )}

        {/* Empty State */}
        {status === 'succeeded' && jobs.length === 0 && (
          <GlowCard style={styles.emptyCard}>
            <Ionicons name="documents-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No Crawls Yet
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Submit a URL and question from the Scraper tab to begin crawling.
            </Text>
          </GlowCard>
        )}

        {/* Jobs List */}
        {jobs.map((job) => {
          const isCompleted = job.result !== null && job.result !== undefined;

          return (
            <GlowCard key={job.id} style={styles.jobCard}>
              {/* Card Header: URL and Status Badge */}
              <View style={styles.cardHeader}>
                <View style={styles.urlContainer}>
                  <Ionicons name="globe-outline" size={16} color={colors.primary} />
                  <Text
                    style={[styles.urlText, { color: colors.text }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {job.url}
                  </Text>
                </View>

                {/* Status Badge */}
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isCompleted
                        ? colors.successBg
                        : colors.cardGlow,
                      borderColor: isCompleted
                        ? colors.successBorder
                        : colors.cardBorder,
                    },
                  ]}
                >
                  {!isCompleted && (
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text
                    style={[
                      styles.badgeText,
                      { color: isCompleted ? colors.success : colors.primary },
                    ]}
                  >
                    {isCompleted ? 'Completed' : 'In Progress'}
                  </Text>
                </View>
              </View>

              {/* Question / Query */}
              <View
                style={[
                  styles.queryBox,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                  },
                ]}
              >
                <Text style={[styles.queryLabel, { color: colors.textMuted }]}>
                  QUESTION
                </Text>
                <Text style={[styles.queryText, { color: colors.text }]}>
                  {job.query}
                </Text>
              </View>

              {/* Result Answer or In-Progress Indicator */}
              {isCompleted ? (
                <View
                  style={[
                    styles.resultBox,
                    {
                      backgroundColor: colors.successBg,
                      borderColor: colors.successBorder,
                    },
                  ]}
                >
                  <View style={styles.resultHeader}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={16}
                      color={colors.success}
                    />
                    <Text style={[styles.resultLabel, { color: colors.success }]}>
                      ANSWER
                    </Text>
                  </View>
                  <Text style={[styles.resultText, { color: colors.text }]}>
                    {job.result}
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.pendingBox,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Ionicons name="sync-outline" size={16} color={colors.primary} />
                  <Text style={[styles.pendingText, { color: colors.textMuted }]}>
                    Crawling pages and synthesizing answer... Updates live.
                  </Text>
                </View>
              )}

              {/* Job ID Footer */}
              <Text style={[styles.jobIdText, { color: colors.textMuted }]}>
                ID: {job.id}
              </Text>
            </GlowCard>
          );
        })}
      </ScrollView>
    </SpaceBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
    gap: 16,
    flexGrow: 1,
  },
  header: {
    gap: 4,
    marginBottom: 8,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subheading: {
    fontSize: 14,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  errorCard: {
    gap: 12,
    alignItems: 'flex-start',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  errorBody: {
    fontSize: 14,
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  jobCard: {
    gap: 12,
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  urlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  urlText: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  queryBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  queryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  queryText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  resultBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  resultText: {
    fontSize: 13,
    lineHeight: 20,
  },
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  pendingText: {
    fontSize: 12,
    fontStyle: 'italic',
    flex: 1,
  },
  jobIdText: {
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
});
