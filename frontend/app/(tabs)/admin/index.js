import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSelector } from 'react-redux';
import GlowCard from '../../../src/components/GlowCard';
import SpaceBackground from '../../../src/components/SpaceBackground';
import { URLS } from '../../../src/config/urls';
import { useAppTheme } from '../../../src/hooks/useAppTheme';

// Data-driven tile list — a future "Database" tile (storage capacity management, explicitly
// deferred per docs/planning/02-admin-dashboard-plan.md) is just one more entry here, not a
// layout change. `url` tiles open the generic webview screen; `route` tiles push a real in-app
// screen.
const TILES = [
  {
    key: 'users',
    label: 'User Management',
    description: 'View, edit, and remove user accounts',
    icon: 'people-outline',
    route: '/admin/users',
  },
  {
    key: 'grafana',
    label: 'Grafana',
    description: 'Metrics, logs, and traces dashboards',
    icon: 'stats-chart-outline',
    url: URLS.admin.grafana,
  },
  {
    key: 'kafka-ui',
    label: 'Kafka UI',
    description: 'Browse topics, partitions, and consumer groups',
    icon: 'layers-outline',
    url: URLS.admin.kafkaUi,
  },
];

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const accessToken = useSelector((state) => state.auth.accessToken);

  const openTile = (tile) => {
    if (tile.route) {
      router.push(tile.route);
      return;
    }
    // One-time query-param token for the very first navigation — the Gateway's
    // AdminAuthGateMiddleware upgrades this into an httpOnly cookie that every request after
    // (including the proxied app's own asset/API calls) carries automatically. See
    // docs/planning/02-admin-dashboard-plan.md, Decision 2.
    const fullUrl = `${tile.url}?token=${accessToken}`;

    // react-native-webview has no web implementation at all (verified: its own fallback for
    // unsupported platforms literally renders "does not support this platform" — confirmed via
    // its source, not assumed) — and embedding via a real <iframe> on web instead would need
    // Grafana's GF_SECURITY_ALLOW_EMBEDDING, which Decision 1 explicitly avoids adding. A real
    // top-level browser navigation (new tab) sidesteps both: no iframe anywhere, so the
    // no-embedding-permission stance holds on every platform, and it's still "full-screen, never
    // framed" in spirit. Native (iOS/Android) keeps the in-app WebView screen, where this
    // restriction doesn't apply — a native WebView isn't a browser <iframe>, X-Frame-Options is
    // irrelevant to it.
    if (Platform.OS === 'web') {
      Linking.openURL(fullUrl);
      return;
    }
    router.push({
      pathname: '/admin/webview',
      params: { url: fullUrl, title: tile.label },
    });
  };

  return (
    <SpaceBackground>
      <View style={styles.container}>
        <Text style={[styles.heading, { color: colors.text }]}>Admin Dashboard</Text>
        <Text style={[styles.subheading, { color: colors.textMuted }]}>
          Manage users and reach the observability stack
        </Text>

        <View style={styles.tiles}>
          {TILES.map((tile) => (
            <TouchableOpacity key={tile.key} onPress={() => openTile(tile)} activeOpacity={0.85}>
              <GlowCard style={styles.tileCard}>
                <View style={[styles.iconWrapper, { backgroundColor: colors.orbBg }]}>
                  <Ionicons name={tile.icon} size={24} color={colors.primary} />
                </View>
                <View style={styles.tileText}>
                  <Text style={[styles.tileLabel, { color: colors.text }]}>{tile.label}</Text>
                  <Text style={[styles.tileDescription, { color: colors.textMuted }]}>
                    {tile.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </GlowCard>
            </TouchableOpacity>
          ))}
        </View>
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
  subheading: {
    fontSize: 14,
    marginBottom: 24,
  },
  tiles: {
    gap: 16,
  },
  tileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    flex: 1,
    gap: 2,
  },
  tileLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  tileDescription: {
    fontSize: 13,
  },
});
