import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '../../../src/hooks/useAppTheme';

// Generic full-screen WebView screen, reused for both Grafana and Kafka UI (and any future
// full-screen admin tool) via `url`/`title` route params — see
// docs/planning/02-admin-dashboard-plan.md, Decision 1: full-screen per tool, never an embedded
// iframe pane, so this is the only screen needed regardless of how many tools exist.
//
// Native (iOS/Android/etc.) only — `react-native-webview` has no web implementation (its own
// fallback for unsupported platforms literally renders "does not support this platform"; verified
// via source, not assumed). On web, admin/index.js's openTile() never routes here at all — it
// opens the tool in a new browser tab instead (Linking.openURL), since the only web-native way to
// embed would be a real <iframe>, which needs Grafana's GF_SECURITY_ALLOW_EMBEDDING — something
// Decision 1 explicitly avoids adding.
//
// Renders full-screen with the platform's native header re-enabled just for this one screen
// (the admin Stack's default is headerShown: false, like the rest of the app) — once the WebView
// takes over, the tool's own UI fills the screen, so a plain native back button is the only way
// out; it doesn't need to match the app's own themed chrome since it's a boundary into an
// external system, not one of our own screens.
export default function AdminWebViewScreen() {
  const { url, title } = useLocalSearchParams();
  const { colors } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: title ?? 'Admin' }} />

      {error ? (
        <View style={[styles.center, { backgroundColor: colors.card }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>
            Couldn&apos;t load {title ?? 'this page'}: {error}
          </Text>
        </View>
      ) : (
        <WebView
          source={{ uri: url }}
          style={styles.webview}
          onLoadEnd={() => setLoading(false)}
          onError={({ nativeEvent }) => {
            setLoading(false);
            setError(nativeEvent?.description ?? 'Unknown error');
          }}
        />
      )}

      {loading && !error && (
        <View style={[styles.loadingOverlay, { backgroundColor: colors.bg?.[0] ?? '#000' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
