import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { dark, light } from '../theme/colors';
import { useAppTheme } from '../hooks/useAppTheme';

const STARS = [
  { x: '8%', y: '12%', s: 2 }, { x: '23%', y: '5%', s: 1 },
  { x: '41%', y: '18%', s: 2 }, { x: '67%', y: '8%', s: 1 },
  { x: '82%', y: '22%', s: 3 }, { x: '91%', y: '11%', s: 1 },
  { x: '15%', y: '35%', s: 1 }, { x: '55%', y: '31%', s: 2 },
  { x: '78%', y: '45%', s: 1 }, { x: '4%', y: '55%', s: 2 },
  { x: '33%', y: '62%', s: 1 }, { x: '88%', y: '67%', s: 2 },
  { x: '47%', y: '75%', s: 1 }, { x: '11%', y: '80%', s: 3 },
  { x: '64%', y: '84%', s: 1 }, { x: '96%', y: '78%', s: 2 },
  { x: '29%', y: '90%', s: 1 }, { x: '73%', y: '93%', s: 2 },
  { x: '52%', y: '50%', s: 1 }, { x: '19%', y: '47%', s: 2 },
];

export default function SpaceBackground({ children, style }) {
  const { isDark } = useAppTheme();
  // Opacity of the dark layer: 1 = dark mode showing, 0 = light mode showing
  const darkOpacity = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(darkOpacity, {
      toValue: isDark ? 1 : 0,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [isDark]);

  return (
    <View style={[styles.root, style]}>
      {/* Light layer — always visible underneath */}
      <LinearGradient colors={light.bg} style={StyleSheet.absoluteFill} />

      {/* Dark layer — fades in/out */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: darkOpacity }]}>
        <LinearGradient colors={dark.bg} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Stars fade with the dark layer */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: darkOpacity }]}
        pointerEvents="none"
      >
        {STARS.map((star, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: star.x,
              top: star.y,
              width: star.s,
              height: star.s,
              borderRadius: star.s,
              backgroundColor: dark.star,
              opacity: 0.3 + (i % 5) * 0.12,
            }}
          />
        ))}
      </Animated.View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
