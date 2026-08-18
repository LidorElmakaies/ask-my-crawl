import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeAnim } from '../../src/context/ThemeAnimContext';
import { useAppTheme } from '../../src/hooks/useAppTheme';

import { dark as darkColors, light as lightColors } from '../../src/theme/colors';

const TABS = [
  { name: 'index',    label: 'Home',     icon: 'home',        iconActive: 'home' },
  { name: 'scraper',  label: 'Scraper',  icon: 'search-outline', iconActive: 'search' },
  { name: 'settings', label: 'Settings', icon: 'settings-outline', iconActive: 'settings' },
];

function CustomTabBar({ navigation, state }) {
  const { colors } = useAppTheme();
  const progress = useThemeAnim();

  const animatedBg = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [lightColors.tabBar, darkColors.tabBar],
  });

  const animatedBorder = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [lightColors.tabBarBorder, darkColors.tabBarBorder],
  });

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: animatedBg, borderTopColor: animatedBorder },
      ]}
    >
      {TABS.map((tab, index) => {
        const isActive = state.index === index;

        return (
          <TouchableOpacity
            key={tab.name}
            onPress={() => navigation.navigate(tab.name)}
            style={styles.tab}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.iconWrapper,
                isActive && {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  borderWidth: 1,
                  shadowColor: colors.primary,
                  shadowOpacity: 0.4,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 4,
                },
              ]}
            >
              <Ionicons
                name={isActive ? tab.iconActive : tab.icon}
                size={22}
                color={isActive ? colors.activeTab : colors.inactiveTab}
              />
            </View>
            <Text
              style={[
                styles.label,
                { color: isActive ? colors.activeTab : colors.inactiveTab },
                isActive && styles.labelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="scraper" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  iconWrapper: {
    width: 40,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '700',
  },
});
