import { gluestackUIConfig } from '@gluestack-ui/config';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { useColorScheme } from 'react-native';
import { useSelector } from 'react-redux';

export default function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const { mode } = useSelector((state) => state.theme);

  const colorMode = mode === null ? (systemScheme ?? 'light') : mode;

  return (
    <GluestackUIProvider config={gluestackUIConfig} colorMode={colorMode}>
      {children}
    </GluestackUIProvider>
  );
}
