import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="profile-setup" />
      <Stack.Screen name="feature-tour" />
    </Stack>
  );
}

