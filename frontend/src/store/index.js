import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import { FLUSH, PAUSE, PERSIST, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE } from 'redux-persist';
import authReducer from './slices/authSlice';
import scraperReducer from './slices/scraperSlice';
import themeReducer from './slices/themeSlice';
import wsReducer from './slices/wsSlice';

const themePersistConfig = {
  key: 'theme',
  storage: AsyncStorage,
};

const authPersistConfig = {
  key: 'auth',
  storage: AsyncStorage,
  // status/error are per-submission ephemeral state (same rule as scraperSlice/wsSlice) — only
  // user/accessToken/refreshToken should survive a reload.
  blacklist: ['status', 'error'],
};

export const store = configureStore({
  reducer: {
    scraper: scraperReducer,
    theme: persistReducer(themePersistConfig, themeReducer),
    auth: persistReducer(authPersistConfig, authReducer),
    ws: wsReducer, // ephemeral, like scraper — connection status shouldn't survive a reload
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);
