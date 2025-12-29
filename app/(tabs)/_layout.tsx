import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
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
          headerShown: true,
          tabBarIcon: ({color}) => <Ionicons name="calendar-outline" size={28} color={color} />,
          headerTitle: () => (
            <View className="flex-1">
              <ThemedText type="title" className="text-xl font-bold">
                Schedule
              </ThemedText>
              <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
                Tap to view, double tap to add flights 🐔
              </ThemedText>
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
