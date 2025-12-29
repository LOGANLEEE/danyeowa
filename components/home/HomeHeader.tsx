import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getGreeting, getUserDisplayName, getUserInitials } from '@/utils/home.utils';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

type HomeHeaderProps = {
  profile: {full_name?: string; email?: string; avatar_url?: string} | null;
  onProfilePress: () => void;
};

export function HomeHeader({profile, onProfilePress}: HomeHeaderProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  return (
    <ThemedView className="px-6 pt-8 pb-6">
      <Animated.View
        style={styles.modernHeader}
        className="flex-row items-center justify-between mb-6">
        {/* Left: Greeting & Title */}
        <View className="flex-1 mr-4">
          <ThemedText
            className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 tracking-wide uppercase"
            animated
            delay={0}>
            {getGreeting()}
          </ThemedText>
          <ThemedText
            type="title"
            className="text-5xl font-black leading-none tracking-tight"
            animated
            delay={50}
            style={{
              letterSpacing: -1,
            }}>
            {getUserDisplayName(profile)}
          </ThemedText>
        </View>

        {/* Right: User Avatar */}
        <TouchableOpacity activeOpacity={0.7} onPress={onProfilePress}>
          <View className="relative">
            <Animated.View
              className="w-16 h-16 rounded-full items-center justify-center overflow-hidden"
              style={[
                styles.avatarContainer,
                {
                  backgroundColor: themeColors.tint,
                  shadowColor: themeColors.tint,
                  shadowOffset: {width: 0, height: 6},
                  shadowOpacity: 0.4,
                  shadowRadius: 12,
                  elevation: 10,
                },
              ]}>
              {profile?.avatar_url ? (
                <ThemedText className="text-2xl">🦃</ThemedText>
              ) : (
                <ThemedText className="text-xl font-black" style={{color: '#FFFFFF'}}>
                  {getUserInitials(profile)}
                </ThemedText>
              )}
            </Animated.View>
            {/* Online indicator with pulse effect */}
            <Animated.View
              className="absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900"
              style={{
                backgroundColor: '#10B981',
                shadowColor: '#10B981',
                shadowOffset: {width: 0, height: 2},
                shadowOpacity: 0.8,
                shadowRadius: 4,
                elevation: 4,
              }}
            />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Subtitle with modern typography */}
      <ThemedText
        className="text-base text-gray-600 dark:text-gray-400 leading-6 font-medium"
        animated
        delay={100}>
        Here's your flight roster overview
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  modernHeader: {
    minHeight: 60,
  },
  avatarContainer: {
    borderRadius: 32,
  },
});

