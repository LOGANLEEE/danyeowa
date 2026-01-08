import { CoffeeIcon } from '@/components/CoffeeIcon';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

export function EmptyStateCard() {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  return (
    <ThemedView
      animated
      delay={100}
      className="mx-6 mb-6 rounded-3xl p-8 border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 items-center">
      <View className="flex-row items-center justify-center mb-4">
        <View
          className="w-20 h-20 rounded-full items-center justify-center mr-3"
          style={{backgroundColor: `${themeColors.tint}15`}}>
          <Ionicons name="airplane-outline" size={40} color={themeColors.tint} />
        </View>
        <CoffeeIcon size={32} color={themeColors.coffeeMedium} animated />
      </View>
      <ThemedText animated delay={200} type="subtitle" className="text-center mb-2">
        No upcoming flights
      </ThemedText>
      <ThemedText
        animated
        delay={300}
        className="text-sm text-center text-gray-500 dark:text-gray-400">
        No upcoming flights… maybe grab a ☕?
      </ThemedText>
    </ThemedView>
  );
}






