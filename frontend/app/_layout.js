import { Stack } from 'expo-router';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ThemeAnimProvider } from '../src/context/ThemeAnimContext';
import ThemeProvider from '../src/components/ThemeProvider';
import { persistor, store } from '../src/store';

export default function RootLayout() {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor}>
        <ThemeProvider>
          <ThemeAnimProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeAnimProvider>
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
}
