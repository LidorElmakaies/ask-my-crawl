import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import GlowCard from '../../src/components/GlowCard';
import GradientButton from '../../src/components/GradientButton';
import InfoBox from '../../src/components/InfoBox';
import InputField from '../../src/components/InputField';
import ScreenHeader from '../../src/components/ScreenHeader';
import SelectField from '../../src/components/SelectField';
import SpaceBackground from '../../src/components/SpaceBackground';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import {
  clearJobsError,
  submitJobRequest,
} from '../../src/store/slices/jobsSlice';
import {
  getQueryError,
  MAX_CRAWL_DEPTH,
  MAX_QUERY_LENGTH,
} from '../../src/utils/validation';

const DEPTH_OPTIONS = [
  { label: `Default (${MAX_CRAWL_DEPTH})`, value: undefined },
  ...Array.from({ length: MAX_CRAWL_DEPTH }, (_, i) => ({
    label: String(i + 1),
    value: i + 1,
  })),
];

export default function ScraperScreen() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState(undefined);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();
  const dispatch = useDispatch();
  const { submitStatus, submitError } = useSelector((state) => state.jobs);
  const { colors } = useAppTheme();

  const queryError = getQueryError(query);
  const canSubmit = !!input.trim() && !!query.trim() && !queryError;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitted(false);
    const action = await dispatch(
      submitJobRequest({ url: input.trim(), query: query.trim(), depth }),
    );
    if (submitJobRequest.fulfilled.match(action)) {
      setSubmitted(true);
    }
  };

  const handleClear = () => {
    setInput('');
    setQuery('');
    setDepth(undefined);
    setSubmitted(false);
    dispatch(clearJobsError());
  };

  return (
    <SpaceBackground>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Scrape a URL"
          subtitle="Enter any web address below"
          style={styles.header}
        />

        <GlowCard style={styles.fields}>
          <InputField
            label="TARGET URL"
            value={input}
            onChangeText={setInput}
            placeholder="https://example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            monospace
            glow
          />

          <InputField
            label="QUERY"
            value={query}
            onChangeText={setQuery}
            placeholder="What do you want to know about this page?"
            multiline
            maxLength={MAX_QUERY_LENGTH}
            showCharCount
            error={queryError}
            glow
          />

          <SelectField
            label="MAX DEPTH (OPTIONAL)"
            hint="How many hops of links to follow from the URL."
            value={depth}
            options={DEPTH_OPTIONS}
            onChange={setDepth}
          />

          <GradientButton
            label="Send Request"
            onPress={handleSubmit}
            loading={submitStatus === 'loading'}
            disabled={!canSubmit}
          />
        </GlowCard>

        {/* Result */}
        {submitStatus === 'succeeded' && submitted && (
          <InfoBox variant="success" style={styles.feedback}>
            <Text style={[styles.feedbackTitle, { color: colors.success }]}>
              ✓ Request Accepted
            </Text>
            <Text style={[styles.feedbackBody, { color: colors.text }]}>
              Your crawl job has been queued. You can monitor the progress and
              view the answer live in the History tab.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/history')}
              style={[styles.historyBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.historyBtnText, { color: colors.onPrimary }]}
              >
                View in History
              </Text>
            </TouchableOpacity>
          </InfoBox>
        )}

        {submitStatus === 'failed' && submitError && (
          <InfoBox variant="error" style={styles.feedback}>
            <Text style={[styles.feedbackTitle, { color: colors.error }]}>
              ✗ Error
            </Text>
            <Text style={[styles.feedbackBody, { color: colors.text }]}>
              {submitError}
            </Text>
          </InfoBox>
        )}

        {(submitted || submitStatus === 'failed') && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Text style={[styles.clearText, { color: colors.primary }]}>
              Clear
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SpaceBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
    gap: 20,
    flexGrow: 1,
  },
  header: {
    marginBottom: 4,
  },
  fields: {
    gap: 20,
  },
  feedback: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  feedbackBody: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  clearBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  clearText: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  historyBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
