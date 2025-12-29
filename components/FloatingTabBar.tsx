import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from './haptic-tab';

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const backgroundColor =
    colorScheme === 'dark'
      ? 'rgba(42, 42, 42, 0.95)'
      : 'rgba(255, 255, 255, 0.95)';

  const borderColor =
    colorScheme === 'dark'
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.1)';

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}>
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor,
            borderColor,
            shadowColor: colorScheme === 'dark' ? '#000' : '#000',
          },
        ]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const iconName = getIconName(route.name, isFocused);

          return (
            <HapticTab
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}>
              <TabIcon
                iconName={iconName}
                isFocused={isFocused}
                color={isFocused ? themeColors.tint : themeColors.tabIconDefault}
                label={String(label)}
              />
            </HapticTab>
          );
        })}
      </View>
    </View>
  );
}

function TabIcon({
  iconName,
  isFocused,
  color,
  label,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  isFocused: boolean;
  color: string;
  label: string;
}) {
  const scale = useSharedValue(isFocused ? 1.1 : 1);
  const opacity = useSharedValue(isFocused ? 1 : 0.6);

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1.1 : 1, {
      damping: 15,
      stiffness: 150,
    });
    opacity.value = withSpring(isFocused ? 1 : 0.6, {
      damping: 15,
      stiffness: 150,
    });
  }, [isFocused, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.iconContainer}>
      <Animated.View style={animatedStyle}>
        <Ionicons name={iconName} size={24} color={color} />
      </Animated.View>
    </View>
  );
}

function getIconName(
  routeName: string,
  isFocused: boolean,
): keyof typeof Ionicons.glyphMap {
  switch (routeName) {
    case 'home':
      return isFocused ? 'home' : 'home-outline';
    case 'schedule':
      return isFocused ? 'calendar' : 'calendar-outline';
    default:
      return 'ellipse-outline';
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    pointerEvents: 'box-none',
  },
  tabBar: {
    flexDirection: 'row',
    height: 64,
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

