import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import SpaceBackground from '../../src/components/SpaceBackground';
import { useAppTheme } from '../../src/hooks/useAppTheme';

export default function HomeScreen() {
  const { isDark, colors } = useAppTheme();

  return (
    <SpaceBackground>
      <View style={styles.container}>
        {/* Decorative orb */}
        <View
          style={[
            styles.orb,
            {
              backgroundColor: colors.orbBg,
            },
          ]}
        />

        <View style={styles.content}>
          {/* Badge */}
          <View
            style={[
              styles.badge,
              {
                backgroundColor: colors.card,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              ✦ Web Intelligence Tool
            </Text>
          </View>

          {/* Title */}
          <LinearGradient
            colors={colors.primaryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.titleGradient}
          >
            <Text style={styles.title}>WEBSCRAPER</Text>
          </LinearGradient>

          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Extract structured data from any URL{'\n'}and send it to your
            backend pipeline.
          </Text>

          {/* Feature dots */}
          <View style={styles.features}>
            {['Fast extraction', 'Clean data', 'API ready'].map((f) => (
              <View
                key={f}
                style={[
                  styles.featurePill,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <View
                  style={[
                    styles.featureDot,
                    { backgroundColor: colors.primary },
                  ]}
                />
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {f}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </SpaceBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  orb: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: '10%',
    alignSelf: 'center',
    filter: 'blur(80px)',
  },
  content: {
    alignItems: 'center',
    gap: 20,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  titleGradient: {
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 44,
    fontWeight: '900',
    color: '#ffffff', // onPrimary — always white inside LinearGradient, safe in StyleSheet
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 4,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 8,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  featureText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
