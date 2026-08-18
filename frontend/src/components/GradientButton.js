import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

export default function GradientButton({ label, onPress, loading, disabled, style }) {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.wrapper, (disabled || loading) && styles.disabled, style]}
    >
      <LinearGradient
        colors={colors.primaryGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.label}>{label}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  gradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#ffffff', // onPrimary — always white on gradient, moved to StyleSheet
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  disabled: {
    opacity: 0.5,
  },
});
