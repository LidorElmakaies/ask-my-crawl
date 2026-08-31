import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useThemeAnim } from '../../src/context/ThemeAnimContext';
import { useAppTheme } from '../../src/hooks/useAppTheme';

import {
  dark as darkColors,
  light as lightColors,
} from '../../src/theme/colors';

// 'admin' must stay LAST — CustomTabBar below matches array position to state.index (React
// Navigation's actual route index, which always includes every registered <Tabs.Screen> in
// declaration order regardless of the admin-only filtering below). Non-admins never reach the
// admin route at all (app/(tabs)/admin/_layout.js redirects away), so state.index for them can
// only ever land on 0/1/2 — which still lines up with the filtered (3-item) list below. Reordering
// 'admin' out of last place would break that alignment.
const TABS = [
  { name: 'index', label: 'Home', icon: 'home', iconActive: 'home' },
  {
    name: 'scraper',
    label: 'Scraper',
    icon: 'search-outline',
    iconActive: 'search',
  },
  {
    name: 'history',
    label: 'History',
    icon: 'time-outline',
    iconActive: 'time',
  },
  {
    name: 'settings',
    label: 'Settings',
    icon: 'settings-outline',
    iconActive: 'settings',
  },
  {
    name: 'admin',
    label: 'Admin',
    icon: 'shield-outline',
    iconActive: 'shield',
    adminOnly: true,
  },
];

function CustomTabBar({ navigation, state }) {
  const { colors } = useAppTheme();
  const progress = useThemeAnim();
  const role = useSelector((reduxState) => reduxState.auth.user?.role);
  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || role === 'admin');

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
      {visibleTabs.map((tab, index) => {
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
  const role = useSelector((reduxState) => reduxState.auth.user?.role);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="scraper" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="settings" />
      {/* href: null hides the tab from Expo Router's own default tab bar / <Link> resolution for
          non-admins (https://docs.expo.dev/router/advanced/tabs/) — belt-and-suspenders alongside
          CustomTabBar's own visibleTabs filtering above, which is what actually controls this
          fully custom tab bar's rendering. The route itself stays reachable either way; the real
          boundary is app/(tabs)/admin/_layout.js's redirect plus the backend's own role guard. */}
      <Tabs.Screen
        name="admin"
        options={{ href: role === 'admin' ? undefined : null }}
      />
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
