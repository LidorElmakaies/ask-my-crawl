import { createContext, useContext, useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

const ThemeAnimContext = createContext(null);

export function ThemeAnimProvider({ children }) {
  const { isDark } = useAppTheme();
  // useNativeDriver: false so we can interpolate colors (backgroundColor etc.)
  const progress = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isDark ? 1 : 0,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [isDark]);

  return (
    <ThemeAnimContext.Provider value={progress}>
      {children}
    </ThemeAnimContext.Provider>
  );
}

export function useThemeAnim() {
  return useContext(ThemeAnimContext);
}
