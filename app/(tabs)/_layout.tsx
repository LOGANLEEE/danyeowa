import { Tabs } from 'expo-router';
import React from 'react';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { ThemedHeader } from '@/components/ThemedHeader';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      initialRouteName="schedule"
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({color}) => <Ionicons name="home" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          header: () => (
            <ThemedHeader title="Schedule" right={<ThemedText>Add Monthly</ThemedText>} />
          ),
          tabBarIcon: ({color}) => <Ionicons name="calendar-outline" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
