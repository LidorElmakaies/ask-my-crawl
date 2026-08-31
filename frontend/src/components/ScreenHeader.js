import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * Shared, reusable screen heading + subheading block, themed via useAppTheme() like everything
 * else. Use this at the top of every screen instead of hand-rolling a heading/subheading Text
 * pair with inline styles per screen.
 */
export default function ScreenHeader({ title, subtitle, style }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.header, style]}>
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
  heading: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subheading: {
    fontSize: 14,
  },
});
