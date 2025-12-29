import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function HapticTab(props: BottomTabBarButtonProps) {
  const handlePressIn = (ev: any) => {
    // Add haptic feedback when pressing down on the tabs
    // Light feedback for better UX without being too intrusive
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      // Silently fail if haptics are not available
    });
    props.onPressIn?.(ev);
  };

  const handlePress = (ev: any) => {
    // Add haptic feedback on actual press (when releasing)
    // Medium feedback for successful tab selection
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
        // Silently fail if haptics are not available
      });
    } else {
      // Android also supports haptics
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        // Silently fail if haptics are not available
      });
    }
    props.onPress?.(ev);
  };

  return (
    <PlatformPressable
      {...props}
      onPressIn={handlePressIn}
      onPress={handlePress}
    />
  );
}
