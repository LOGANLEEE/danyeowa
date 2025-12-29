import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ModalScreen() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaView edges={[]} className="flex-1">
      <ThemedView className="flex-1 items-center justify-center px-6">
        <ThemedView 
          animated
          delay={0}
          className="items-center">
          <View className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 items-center justify-center mb-6">
            <Ionicons
              name="information-circle-outline"
              size={48}
              color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
            />
          </View>
          <ThemedText 
            animated
            delay={100}
            type="title" 
            className="text-3xl font-bold mb-2 text-center">
            Modal Screen
          </ThemedText>
          <ThemedText 
            animated
            delay={150}
            className="text-base text-gray-500 dark:text-gray-400 text-center mb-8">
            This is a modal screen 🐔
          </ThemedText>
          <ThemedButton
            title="Go to Home"
            variant="primary"
            onPress={() => router.back()}
            fullWidth={false}
          />
        </ThemedView>
      </ThemedView>
    </SafeAreaView>
  );
}
