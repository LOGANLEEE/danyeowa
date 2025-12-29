import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { router } from 'expo-router';

export default function ModalScreen() {
  return (
    <ScreenContainer edges={[]} contentClassName="flex-1 items-center justify-center px-6">
      <EmptyState
        icon="information-circle-outline"
        iconSize={48}
        title="Modal Screen"
        message="This is a modal screen 🐔"
        action={
          <ThemedButton
            title="Go to Home"
            variant="primary"
            onPress={() => router.back()}
            fullWidth={false}
          />
        }
      />
    </ScreenContainer>
  );
}
