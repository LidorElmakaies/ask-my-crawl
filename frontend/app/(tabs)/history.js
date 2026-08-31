import { useEffect } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import EmptyState from '../../src/components/EmptyState';
import GlowCard from '../../src/components/GlowCard';
import InfoBox from '../../src/components/InfoBox';
import ScreenHeader from '../../src/components/ScreenHeader';
import SpaceBackground from '../../src/components/SpaceBackground';
import StatusBadge from '../../src/components/StatusBadge';
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
        <ScreenHeader
          title="Crawl History"
          subtitle="Submitted crawl requests and real-time synthesized answers"
          style={styles.header}
        />

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
          <EmptyState
            align="left"
            icon="alert-circle-outline"
            iconSize={24}
            iconColor={colors.error}
            title="Failed to load history"
            titleColor={colors.error}
            subtitle={error}
            subtitleColor={colors.text}
            actionLabel="Retry"
            onAction={() => dispatch(fetchJobs())}
          />
        )}

        {/* Empty State */}
        {status === 'succeeded' && jobs.length === 0 && (
          <EmptyState
            icon="documents-outline"
            title="No Crawls Yet"
            subtitle="Submit a URL and question from the Scraper tab to begin crawling."
          />
        )}

        {/* Jobs List */}
        {jobs.map((job) => {
          const isCompleted = job.result !== null && job.result !== undefined;

          return (
            <GlowCard key={job.id} style={styles.jobCard}>
              {/* Card Header: URL and Status Badge */}
              <View style={styles.cardHeader}>
                <View style={styles.urlContainer}>
                  <Ionicons
                    name="globe-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.urlText, { color: colors.text }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {job.url}
                  </Text>
                </View>

                <StatusBadge completed={isCompleted} />
              </View>

              {/* Question / Query */}
              <InfoBox
                variant="query"
                label="QUESTION"
                text={job.query}
                textStyle={styles.queryText}
              />

              {/* Result Answer or In-Progress Indicator */}
              {isCompleted ? (
                <InfoBox
                  variant="success"
                  icon="checkmark-circle-outline"
                  label="ANSWER"
                  labelStyle={styles.resultLabel}
                  style={styles.resultBox}
                  text={job.result}
                  textStyle={styles.resultText}
                />
              ) : (
                <InfoBox variant="pending" icon="sync-outline" row>
                  <Text
                    style={[styles.pendingText, { color: colors.textMuted }]}
                  >
                    Crawling pages and synthesizing answer... Updates live.
                  </Text>
                </InfoBox>
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
    marginBottom: 8,
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
  queryText: {
    fontWeight: '500',
  },
  resultBox: {
    gap: 6,
  },
  resultLabel: {
    fontSize: 11,
  },
  resultText: {
    fontSize: 13,
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
