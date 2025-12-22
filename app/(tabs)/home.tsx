
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView edges={['top', 'bottom']}>
      <ThemedView>
        <ThemedText>HELLO WORLD</ThemedText>
      </ThemedView>
    </SafeAreaView>
  );
}
