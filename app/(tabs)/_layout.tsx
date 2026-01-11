import { Tabs } from 'expo-router';
import React from 'react';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      initialRouteName="calendar"
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
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({color}) => <Ionicons name="calendar-outline" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
