import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import GlowCard from './GlowCard';

/**
 * Shared, reusable empty/error placeholder card — icon + title + optional subtitle + optional
 * action button, themed via useAppTheme(). Use this for "nothing here yet" / "failed to load"
 * screens instead of hand-rolling a GlowCard + icon + Text block per screen.
 *
 * `actionLabel`/`onAction` are both optional and only render a button when both are supplied, so
 * a plain empty state (no retry) doesn't get a false action. `align="left"` lays the icon and
 * title out in a row (for an inline error header); the default, `align="center"`, stacks the icon
 * above a centered title/subtitle (for a "nothing here yet" placeholder).
 */
export default function EmptyState({
  icon,
  iconSize = 48,
  iconColor,
  title,
  titleColor,
  subtitle,
  subtitleColor,
  align = 'center',
  actionLabel,
  onAction,
  style,
}) {
  const { colors } = useAppTheme();
  const resolvedIconColor = iconColor ?? colors.textMuted;
  const resolvedTitleColor = titleColor ?? colors.text;
  const resolvedSubtitleColor = subtitleColor ?? colors.textMuted;
  const isLeft = align === 'left';

  return (
    <GlowCard style={[isLeft ? styles.leftContainer : styles.centerContainer, style]}>
      {isLeft ? (
        <View style={styles.headerRow}>
          {icon ? <Ionicons name={icon} size={iconSize} color={resolvedIconColor} /> : null}
          {title ? (
            <Text style={[styles.leftTitle, { color: resolvedTitleColor }]}>{title}</Text>
          ) : null}
        </View>
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={iconSize} color={resolvedIconColor} /> : null}
          {title ? (
            <Text style={[styles.centerTitle, { color: resolvedTitleColor }]}>{title}</Text>
          ) : null}
        </>
      )}
      {subtitle ? (
        <Text
          style={[
            isLeft ? styles.leftSubtitle : styles.centerSubtitle,
            { color: resolvedSubtitleColor },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionText, { color: colors.onPrimary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </GlowCard>
  );
}

const styles = StyleSheet.create({
  leftContainer: {
    gap: 12,
    alignItems: 'flex-start',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leftTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  leftSubtitle: {
    fontSize: 14,
  },
  centerSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  actionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
