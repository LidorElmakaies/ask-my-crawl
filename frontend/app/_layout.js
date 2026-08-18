import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ThemeAnimProvider } from '../src/context/ThemeAnimContext';
import ThemeProvider from '../src/components/ThemeProvider';
import { persistor, store } from '../src/store';
import { connectWebSocket, disconnectWebSocket } from '../src/store/slices/wsSlice';

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

export default function RootLayout() {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor}>
        <ThemeProvider>
          <ThemeAnimProvider>
            <RealtimeConnectionManager />
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeAnimProvider>
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
}
