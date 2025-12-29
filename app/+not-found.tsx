import { ThemedButton } from '@/components/ui/ThemedButton';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stack, router } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{title: 'Oops!'}} />
      <ScreenContainer edges={[]} contentClassName="flex-1 items-center justify-center px-6">
        <EmptyState
          icon="alert-circle-outline"
          iconSize={48}
          title="Page Not Found"
          message="This screen does not exist. 🐔"
          action={
            <ThemedButton
              title="Go to Home"
              variant="primary"
              onPress={() => router.replace('/(tabs)/home')}
              fullWidth={false}
            />
          }
        />
      </ScreenContainer>
    </>
  );
}
