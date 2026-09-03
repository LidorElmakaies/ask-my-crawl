import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * Shared, reusable screen heading + subheading block, themed via useAppTheme() like everything
 * else. Use this at the top of every screen instead of hand-rolling a heading/subheading Text
 * pair with inline styles per screen. Pass `onBack` for a nested (non-tab-root) screen to get a
 * themed back button instead of relying on a native header.
 */
export default function ScreenHeader({ title, subtitle, onBack, style }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.header, style]}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={[styles.heading, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subheading, { color: colors.textMuted }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subheading: {
    fontSize: 14,
  },
});
