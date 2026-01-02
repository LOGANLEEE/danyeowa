import { Stack } from 'expo-router';
import React from 'react';

export default function ScheduleLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="add-monthly" options={{headerShown: false}}/>
    </Stack>
  );
}
