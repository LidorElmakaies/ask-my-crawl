import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import GlowCard from '../../src/components/GlowCard';
import GradientButton from '../../src/components/GradientButton';
import SpaceBackground from '../../src/components/SpaceBackground';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { clearJobsError, submitJobRequest } from '../../src/store/slices/jobsSlice';

export default function ScraperScreen() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [queryFocused, setQueryFocused] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();
  const dispatch = useDispatch();
  const { submitStatus, submitError } = useSelector((state) => state.jobs);
  const { colors } = useAppTheme();

  const canSubmit = !!input.trim() && !!query.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitted(false);
    const action = await dispatch(
      submitJobRequest({ url: input.trim(), query: query.trim() }),
    );
    if (submitJobRequest.fulfilled.match(action)) {
      setSubmitted(true);
    }
  };

  const handleClear = () => {
    setInput('');
    setQuery('');
    setSubmitted(false);
    dispatch(clearJobsError());
  };


  return (
    <SpaceBackground>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.text }]}>Scrape a URL</Text>
          <Text style={[styles.subheading, { color: colors.textMuted }]}>
            Enter any web address below
          </Text>
        </View>

        <GlowCard>
          {/* Label */}
          <Text style={[styles.label, { color: colors.textMuted }]}>TARGET URL</Text>

          {/* Input */}
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: focused ? colors.inputFocusBorder : colors.inputBorder,
                color: colors.text,
                shadowColor: focused ? colors.primary : 'transparent',
                shadowOpacity: 0.4,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
            value={input}
            onChangeText={setInput}
            placeholder="https://example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />

          {/* Label */}
          <Text style={[styles.label, { color: colors.textMuted }]}>QUERY</Text>

          {/* Input */}
          <TextInput
            style={[
              styles.queryInput,
              {
                backgroundColor: colors.inputBg,
                borderColor: queryFocused ? colors.inputFocusBorder : colors.inputBorder,
                color: colors.text,
                shadowColor: queryFocused ? colors.primary : 'transparent',
                shadowOpacity: 0.4,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
            value={query}
            onChangeText={setQuery}
            placeholder="What do you want to know about this page?"
            placeholderTextColor={colors.textMuted}
            multiline
            onFocus={() => setQueryFocused(true)}
            onBlur={() => setQueryFocused(false)}
          />

          {/* Button */}
          <GradientButton
            label="Send Request"
            onPress={handleSubmit}
            loading={submitStatus === 'loading'}
            disabled={!canSubmit}
            style={{ marginTop: 8 }}
          />
        </GlowCard>

        {/* Result */}
        {submitStatus === 'succeeded' && submitted && (
          <View
            style={[
              styles.feedback,
              {
                backgroundColor: colors.successBg,
                borderColor: colors.successBorder,
              },
            ]}
          >
            <Text style={[styles.feedbackTitle, { color: colors.success }]}>
              ✓ Request Accepted
            </Text>
            <Text style={[styles.feedbackBody, { color: colors.text }]}>
              Your crawl job has been queued. You can monitor the progress and view the answer live in the History tab.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/history')}
              style={[styles.historyBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.historyBtnText, { color: colors.onPrimary }]}>
                View in History
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {submitStatus === 'failed' && submitError && (
          <View
            style={[
              styles.feedback,
              {
                backgroundColor: colors.errorBg,
                borderColor: colors.errorBorder,
              },
            ]}
          >
            <Text style={[styles.feedbackTitle, { color: colors.error }]}>
              ✗ Error
            </Text>
            <Text style={[styles.feedbackBody, { color: colors.text }]}>
              {submitError}
            </Text>
          </View>
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
    gap: 4,
    marginBottom: 4,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subheading: {
    fontSize: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 16,
    fontFamily: 'monospace', // URL — monospace suits a raw address
  },
  queryInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 16,
    minHeight: 80,
    textAlignVertical: 'top', // Android: multiline text starts at the top, not vertically centered
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

