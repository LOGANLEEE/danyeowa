import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
  return (
    <SafeAreaView edges={['top', 'bottom']}>
      <ThemedView className="flex-1 items-center justify-center">
        <ThemedText className="text-2xl font-bold">Welcome to the app</ThemedText>
      </ThemedView>
    </SafeAreaView>
  );
}
