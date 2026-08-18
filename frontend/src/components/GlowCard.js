import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

export default function GlowCard({ children, style }) {
  const { isDark, colors } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.shadow,
          shadowOpacity: isDark ? 0.35 : 0.1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 8,
  },
});
