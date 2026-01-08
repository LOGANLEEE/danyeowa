import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="welcome" options={{headerShown: false}} />
      <Stack.Screen
        name="login"
        options={{
          headerShown: false,
          title: 'Sign In',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="signup"
        options={{
          title: 'Create Account',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="verify-otp"
        options={{
          headerShown: false,
          title: 'Verify Code',
        }}
      />
    </Stack>
  );
}
