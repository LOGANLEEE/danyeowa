import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from './haptic-tab';

export function FloatingTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const backgroundColor =
    colorScheme === 'dark' ? 'rgba(42, 42, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';

  const borderColor = colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  // Liquid blob animation values
  const blobPosition = useSharedValue(0);
  const blobWidth = useSharedValue(0);
  const tabPositions = React.useRef<number[]>([]);
  const tabWidths = React.useRef<number[]>([]);

  // Update blob position when active tab changes
  React.useEffect(() => {
    const activeIndex = state.index;
    if (tabPositions.current[activeIndex] !== undefined) {
      blobPosition.value = withTiming(tabPositions.current[activeIndex], {
        duration: 400,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Smooth liquid easing
      });
    }
    if (tabWidths.current[activeIndex] !== undefined) {
      blobWidth.value = withTiming(tabWidths.current[activeIndex], {
        duration: 400,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
      });
    }
  }, [state.index, blobPosition, blobWidth]);

  const handleTabLayout = (index: number) => (event: LayoutChangeEvent) => {
    const {x, width} = event.nativeEvent.layout;
    tabPositions.current[index] = x;
    tabWidths.current[index] = width;
    
    // Initialize blob position on first layout
    if (index === state.index) {
      blobPosition.value = x;
      blobWidth.value = width;
    }
  };

  const blobAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{translateX: blobPosition.value}],
    width: blobWidth.value,
  }));

  const liquidBlobColor =
    colorScheme === 'dark'
      ? 'rgba(201, 162, 77, 0.2)' // GOLD with opacity
      : 'rgba(201, 162, 77, 0.15)'; // GOLD with opacity

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
        {/* Liquid blob background */}
        <Animated.View
          style={[
            styles.liquidBlob,
            {
              backgroundColor: liquidBlobColor,
            },
            blobAnimatedStyle,
          ]}
        />
        
        {state.routes.map((route, index) => {
          const {options} = descriptors[route.key];
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
              accessibilityState={isFocused ? {selected: true} : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
              onLayout={handleTabLayout(index)}>
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
    transform: [{scale: scale.value}],
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

function getIconName(routeName: string, isFocused: boolean): keyof typeof Ionicons.glyphMap {
  switch (routeName) {
    case 'home':
      return isFocused ? 'rocket' : 'rocket-outline';
    case 'schedule':
      return isFocused ? 'calendar-sharp' : 'calendar-outline';
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
    height: 42,
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    alignSelf: 'center',
    maxWidth: 180,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
    borderWidth: StyleSheet.hairlineWidth,
  },
  liquidBlob: {
    position: 'absolute',
    height: 26,
    borderRadius: 20,
    top: 8,
    left: 0,
    ...Platform.select({
      ios: {
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 1,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
