import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import { FLUSH, PAUSE, PERSIST, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE } from 'redux-persist';
import scraperReducer from './slices/scraperSlice';
import themeReducer from './slices/themeSlice';

const themePersistConfig = {
  key: 'theme',
  storage: AsyncStorage,
};

export const store = configureStore({
  reducer: {
    scraper: scraperReducer,
    theme: persistReducer(themePersistConfig, themeReducer),
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);
