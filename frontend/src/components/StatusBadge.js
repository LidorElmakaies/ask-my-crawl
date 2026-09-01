import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

// status -> themed background/border/accent/label, keyed off useAppTheme() tokens.
const STATUS_META = {
  pending: (colors) => ({
    background: colors.cardGlow,
    border: colors.cardBorder,
    accent: colors.primary,
    label: 'In Progress',
  }),
  completed: (colors) => ({
    background: colors.successBg,
    border: colors.successBorder,
    accent: colors.success,
    label: 'Completed',
  }),
  failed: (colors) => ({
    background: colors.errorBg,
    border: colors.errorBorder,
    accent: colors.error,
    label: 'Failed',
  }),
};

/**
 * Shared, reusable job-status pill — a spinner + "In Progress" badge while pending, a
 * checkmark-style "Completed" badge once done, or an alert "Failed" badge, themed via
 * useAppTheme(). Use this anywhere a job/task status needs to be shown instead of hand-rolling
 * the badge per screen.
 */
export default function StatusBadge({ status, style }) {
  const { colors } = useAppTheme();
  const { background, border, accent, label } = STATUS_META[status](colors);

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: background, borderColor: border },
        style,
      ]}
    >
      {status === 'pending' && (
        <ActivityIndicator size="small" color={accent} style={styles.spinner} />
      )}
      {status === 'failed' && (
        <Ionicons
          name="alert-circle"
          size={14}
          color={accent}
          style={styles.spinner}
        />
      )}
      <Text style={[styles.text, { color: accent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  spinner: {
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
