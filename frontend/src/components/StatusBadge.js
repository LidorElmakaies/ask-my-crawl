import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * Shared, reusable job-status pill — a spinner + "In Progress" badge while pending, or a
 * checkmark-style "Completed" badge once done, themed via useAppTheme(). Use this anywhere a
 * job/task completion status needs to be shown instead of hand-rolling the badge per screen.
 */
export default function StatusBadge({ completed, style }) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: completed ? colors.successBg : colors.cardGlow,
          borderColor: completed ? colors.successBorder : colors.cardBorder,
        },
        style,
      ]}
    >
      {!completed && (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.spinner}
        />
      )}
      <Text
        style={[
          styles.text,
          { color: completed ? colors.success : colors.primary },
        ]}
      >
        {completed ? 'Completed' : 'In Progress'}
      </Text>
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
