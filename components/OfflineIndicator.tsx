import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { OfflineStorage } from '@/lib/offline-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { useAuthStore } from '@/stores/use-auth-store';

export function OfflineIndicator() {
  const { isConnected } = useNetworkStatus();
  const { user } = useAuthStore();
  const [showBanner, setShowBanner] = useState(!isConnected);
  const [pendingCount, setPendingCount] = useState(0);
  const slideAnim = useState(new Animated.Value(showBanner ? 0 : -100))[0];

  // Check pending queue count
  useEffect(() => {
    const checkPending = async () => {
      if (user) {
        const queue = await OfflineStorage.getQueue();
        const userQueue = queue.filter((item) => item.userId === user.id);
        setPendingCount(userQueue.length);
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 2000); // Check every 2 seconds
    return () => clearInterval(interval);
  }, [user, isConnected]);

  useEffect(() => {
    if (!isConnected || pendingCount > 0) {
      setShowBanner(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else {
      Animated.spring(slideAnim, {
        toValue: -100,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start(() => {
        setShowBanner(false);
      });
    }
  }, [isConnected, pendingCount, slideAnim]);

  if (!showBanner && isConnected && pendingCount === 0) return null;

  const message = !isConnected
    ? 'You are offline'
    : pendingCount > 0
      ? `Syncing ${pendingCount} change${pendingCount > 1 ? 's' : ''}...`
      : 'Syncing...';

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        transform: [{translateY: slideAnim}],
      }}>
      <ThemedView className="bg-amber-500 dark:bg-amber-600 px-4 py-3 border-b border-amber-600 dark:border-amber-700">
        <View className="flex-row items-center justify-center">
          <Ionicons 
            name={!isConnected ? "cloud-offline-outline" : "sync-outline"} 
            size={20} 
            color="#FFFFFF" 
          />
          <ThemedText className="text-white font-semibold ml-2 text-sm">
            {message}
          </ThemedText>
        </View>
      </ThemedView>
    </Animated.View>
  );
}
