import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import ConnectionStatus from '../../src/components/ConnectionStatus';
import GlowCard from '../../src/components/GlowCard';
import SpaceBackground from '../../src/components/SpaceBackground';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { setThemeMode } from '../../src/store/slices/themeSlice';

export default function SettingsScreen() {
  const dispatch = useDispatch();
  const { mode } = useSelector((state) => state.theme);
  const { status } = useSelector((state) => state.ws);
  const { isDark, colors, colorMode } = useAppTheme();

  const toggle = () => dispatch(setThemeMode(isDark ? 'light' : 'dark'));

  return (
    <SpaceBackground>
      <View style={styles.container}>
        <Text style={[styles.heading, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.section, { color: colors.textMuted }]}>Appearance</Text>

        {/* Toggle pill */}
        <TouchableOpacity
          onPress={toggle}
          activeOpacity={0.85}
          style={[
            styles.pill,
            {
              backgroundColor: colors.card,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          {/* Sliding indicator */}
          <LinearGradient
            colors={colors.primaryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.indicator,
              isDark ? styles.indicatorRight : styles.indicatorLeft,
            ]}
          />

          {/* Light side */}
          <View style={styles.side}>
            <Text style={styles.sideIcon}>☀️</Text>
            <Text
              style={[
                styles.sideLabel,
                { color: !isDark ? colors.onPrimary : colors.textMuted },
              ]}
            >
              Light
            </Text>
          </View>

          {/* Dark side */}
          <View style={styles.side}>
            <Text style={styles.sideIcon}>🌙</Text>
            <Text
              style={[
                styles.sideLabel,
                { color: isDark ? colors.onPrimary : colors.textMuted },
              ]}
            >
              Dark
            </Text>
          </View>
        </TouchableOpacity>

        {mode === null && (
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Following system default · {colorMode}
          </Text>
        )}

        <Text style={[styles.section, styles.connectionSection, { color: colors.textMuted }]}>
          Server connection
        </Text>
        <GlowCard>
          {/* Token is store-managed only (authSlice), never shown/entered here — the real
              login flow (docs/specs/auth.md) will set it. RealtimeConnectionManager in
              app/_layout.js connects automatically whenever a token is present. */}
          <ConnectionStatus status={status} />
        </GlowCard>
      </View>
    </SpaceBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 28,
    gap: 8,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  section: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  pill: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 50,
    overflow: 'hidden',
    height: 56,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    borderRadius: 50,
  },
  indicatorLeft: {
    left: 0,
  },
  indicatorRight: {
    right: 0,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 1,
  },
  sideIcon: {
    fontSize: 18,
  },
  sideLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  note: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
  },
  connectionSection: {
    marginTop: 32,
  },
});
