import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface NotificationPermissions {
  granted: boolean;
  canAskAgain: boolean;
  status: Notifications.PermissionStatus;
}

/**
 * Hook for managing push notifications
 * Handles permissions, token registration, and notification listeners
 */
export function useNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<NotificationPermissions | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Register for push notifications
    registerForPushNotificationsAsync()
      .then((token) => setExpoPushToken(token))
      .catch((error) => console.error('[useNotifications] Error registering for push:', error));

    // Check permissions
    checkPermissions();

    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setNotification(notification);
    });

    // Listen for user tapping on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      // Handle navigation based on notification data
      const data = response.notification.request.content.data;
      // TODO: Navigate based on notification type
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  const checkPermissions = async () => {
    try {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      setPermissions({
        granted: status === 'granted',
        canAskAgain,
        status,
      });
    } catch (error) {
      console.error('[useNotifications] Error checking permissions:', error);
    }
  };

  const requestPermissions = async (): Promise<boolean> => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      const granted = status === 'granted';
      setPermissions({
        granted,
        canAskAgain: status !== 'denied',
        status,
      });
      return granted;
    } catch (error) {
      console.error('[useNotifications] Error requesting permissions:', error);
      return false;
    }
  };

  const scheduleNotification = async (
    title: string,
    body: string,
    trigger: Notifications.NotificationTriggerInput,
    data?: Record<string, any>
  ) => {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: true,
        },
        trigger,
      });
      return notificationId;
    } catch (error) {
      console.error('[useNotifications] Error scheduling notification:', error);
      throw error;
    }
  };

  const cancelNotification = async (notificationId: string) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('[useNotifications] Error canceling notification:', error);
    }
  };

  const cancelAllNotifications = async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('[useNotifications] Error canceling all notifications:', error);
    }
  };

  const getBadgeCount = async (): Promise<number> => {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('[useNotifications] Error getting badge count:', error);
      return 0;
    }
  };

  const setBadgeCount = async (count: number) => {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('[useNotifications] Error setting badge count:', error);
    }
  };

  return {
    expoPushToken,
    permissions,
    notification,
    requestPermissions,
    checkPermissions,
    scheduleNotification,
    cancelNotification,
    cancelAllNotifications,
    getBadgeCount,
    setBadgeCount,
  };
}

/**
 * Register for push notifications and get Expo push token
 */
async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  try {
    // Check if running on device (notifications don't work on simulator)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // Check permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[useNotifications] Failed to get push token for push notification!');
      return null;
    }

    // Get Expo push token
    token = (await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID, // You'll need to set this in your .env
    })).data;
  } catch (error) {
    console.error('[useNotifications] Error registering for push notifications:', error);
  }

  return token;
}

