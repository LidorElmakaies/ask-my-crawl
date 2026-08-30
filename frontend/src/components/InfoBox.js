import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

// variant -> themed background/border/accent color triple, keyed off the exact useAppTheme()
// tokens each hand-rolled box already used.
const VARIANTS = {
  query: (colors) => ({ background: colors.inputBg, border: colors.inputBorder, accent: colors.textMuted }),
  success: (colors) => ({ background: colors.successBg, border: colors.successBorder, accent: colors.success }),
  pending: (colors) => ({ background: colors.card, border: colors.cardBorder, accent: colors.primary }),
  error: (colors) => ({ background: colors.errorBg, border: colors.errorBorder, accent: colors.error }),
};

/**
 * Shared, reusable bordered info box — themed background/border pair selected by `variant`
 * ('query' | 'success' | 'pending' | 'error'), an optional all-caps label row (with optional
 * icon), and body content via `children` or a `text` string. Use this everywhere a themed
 * question/answer/status/feedback box is needed instead of hand-rolling a bordered View + Text
 * per screen.
 *
 * `style`/`labelStyle`/`textStyle` let a call site adjust padding/radius/gap/font-size for its
 * exact case without re-implementing the color logic; `row` lays out `icon` + `children` side by
 * side (no label row) for inline status-line style boxes.
 */
export default function InfoBox({
  variant = 'query',
  icon,
  label,
  labelStyle,
  row = false,
  style,
  children,
  text,
  textStyle,
}) {
  const { colors } = useAppTheme();
  const { background, border, accent } = VARIANTS[variant](colors);

  const body = children ?? (text ? (
    <Text style={[styles.text, { color: colors.text }, textStyle]}>{text}</Text>
  ) : null);

  if (row) {
    return (
      <View style={[styles.rowContainer, { backgroundColor: background, borderColor: border }, style]}>
        {icon ? <Ionicons name={icon} size={16} color={accent} /> : null}
        {body}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background, borderColor: border }, style]}>
      {label ? (
        <View style={styles.labelRow}>
          {icon ? <Ionicons name={icon} size={16} color={accent} /> : null}
          <Text style={[styles.label, { color: accent }, labelStyle]}>{label}</Text>
        </View>
      ) : null}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
});
