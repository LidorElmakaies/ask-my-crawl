import { useColorScheme } from 'react-native';
import { useSelector } from 'react-redux';
import { dark, light } from '../theme/colors';

export function useAppTheme() {
  const systemScheme = useColorScheme();
  const { mode } = useSelector((state) => state.theme);
  const isDark = mode === 'dark' || (mode === null && systemScheme === 'dark');
  return {
    isDark,
    colors: isDark ? dark : light,
    colorMode: isDark ? 'dark' : 'light',
  };
}
