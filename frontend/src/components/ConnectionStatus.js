import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

// Mirrors wsSlice's `status` values (idle | connecting | connected | disconnected | error).
const STATUS_META = {
  connected: { label: 'Connected', colorKey: 'success' },
  connecting: { label: 'Connecting…', colorKey: 'accent' },
  disconnected: { label: 'Disconnected', colorKey: 'textMuted' },
  error: { label: 'Connection error', colorKey: 'error' },
  idle: { label: 'Not connected', colorKey: 'textMuted' },
};

/**
 * Small reusable "are we live" indicator — dot + label, driven entirely by wsSlice's status.
 * Reads Redux state only; doesn't touch the connection itself (that's wsSlice's thunks).
 */
export default function ConnectionStatus({ status, style }) {
  const { colors } = useAppTheme();
  const meta = STATUS_META[status] || STATUS_META.idle;
  const dotColor = colors[meta.colorKey] || colors.textMuted;

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, { color: colors.text }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
