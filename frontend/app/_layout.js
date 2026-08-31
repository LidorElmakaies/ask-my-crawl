import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ThemeAnimProvider } from '../src/context/ThemeAnimContext';
import ThemeProvider from '../src/components/ThemeProvider';
import { persistor, store } from '../src/store';
import { clearAuth } from '../src/store/slices/authSlice';
import {
  connectWebSocket,
  disconnectWebSocket,
} from '../src/store/slices/wsSlice';
import { isTokenExpired, msUntilExpiry } from '../src/utils/jwt';

// Connects/disconnects the WS as soon as a token becomes available/unavailable — app-wide, not
// tied to any one screen's mount lifecycle. Still no custom hook: this just dispatches the
// thunks that own the actual socket; wsSlice does everything else.
function RealtimeConnectionManager() {
  const dispatch = useDispatch();
  const { accessToken } = useSelector((state) => state.auth);

  useEffect(() => {
    if (accessToken) {
      dispatch(connectWebSocket());
    } else {
      dispatch(disconnectWebSocket());
    }
  }, [accessToken, dispatch]);

  return null;
}

// Gates the (tabs) screens behind a session, same shape as RealtimeConnectionManager above: no
// UI, just an app-wide effect reacting to authSlice.accessToken. No valid session → bounce to
// /login; landing on /login or /register with a session already → bounce into the app.
//
// "No valid session" means either no token at all, or a token whose exp claim has already
// passed (docs/specs/auth.md: 15-min TTL) — a token isn't just checked for presence once, it's
// re-checked on every navigation, and a timer proactively clears it the moment it expires rather
// than waiting for some future API call to 401 first.
function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const dispatch = useDispatch();
  const { accessToken } = useSelector((state) => state.auth);

  useEffect(() => {
    if (!accessToken) return;
    if (isTokenExpired(accessToken)) {
      dispatch(clearAuth());
      return;
    }
    const timer = setTimeout(
      () => dispatch(clearAuth()),
      msUntilExpiry(accessToken),
    );
    return () => clearTimeout(timer);
  }, [accessToken, dispatch]);

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    const hasValidSession = !!accessToken && !isTokenExpired(accessToken);
    if (!hasValidSession && !inAuthGroup) {
      router.replace('/login');
    } else if (hasValidSession && inAuthGroup) {
      router.replace('/');
    }
  }, [accessToken, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor}>
        <ThemeProvider>
          <ThemeAnimProvider>
            <AuthGate />
            <RealtimeConnectionManager />
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeAnimProvider>
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
}
