import { Roster } from '@/lib/supabase/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  ROSTERS_CACHE: '@roaster_me:rosters_cache',
  ROSTERS_LAST_SYNC: '@roaster_me:rosters_last_sync',
  OFFLINE_QUEUE: '@roaster_me:offline_queue',
  PROFILE_CACHE: '@roaster_me:profile_cache',
  CONNECTIONS_CACHE: '@roaster_me:connections_cache',
} as const;

export interface CachedRosters {
  rosters: Roster[];
  lastSync: number;
  version: number;
}

export interface OfflineQueueItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: 'rosters' | 'connections' | 'shared_rosters';
  data: any;
  timestamp: number;
  retries: number;
  userId: string;
}

/**
 * Offline Storage Service
 * Handles caching and offline queue management
 */
export class OfflineStorage {
  /**
   * Cache rosters data
   */
  static async cacheRosters(rosters: Roster[]): Promise<void> {
    try {
      const cache: CachedRosters = {
        rosters,
        lastSync: Date.now(),
        version: 1,
      };
      await AsyncStorage.setItem(STORAGE_KEYS.ROSTERS_CACHE, JSON.stringify(cache));
    } catch (error) {
      console.error('[OfflineStorage] Error caching rosters:', error);
    }
  }

  /**
   * Get cached rosters
   */
  static async getCachedRosters(): Promise<Roster[] | null> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.ROSTERS_CACHE);
      if (!cached) return null;
      
      const cache: CachedRosters = JSON.parse(cached);
      return cache.rosters;
    } catch (error) {
      console.error('[OfflineStorage] Error getting cached rosters:', error);
      return null;
    }
  }

  /**
   * Get last sync timestamp
   */
  static async getLastSyncTime(): Promise<number | null> {
    try {
      const timestamp = await AsyncStorage.getItem(STORAGE_KEYS.ROSTERS_LAST_SYNC);
      return timestamp ? parseInt(timestamp, 10) : null;
    } catch (error) {
      console.error('[OfflineStorage] Error getting last sync time:', error);
      return null;
    }
  }

  /**
   * Add operation to offline queue
   */
  static async addToQueue(item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<string> {
    try {
      const queue = await this.getQueue();
      const newItem: OfflineQueueItem = {
        ...item,
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        retries: 0,
      };
      
      queue.push(newItem);
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
      
      return newItem.id;
    } catch (error) {
      console.error('[OfflineStorage] Error adding to queue:', error);
      throw error;
    }
  }

  /**
   * Get offline queue
   */
  static async getQueue(): Promise<OfflineQueueItem[]> {
    try {
      const queue = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('[OfflineStorage] Error getting queue:', error);
      return [];
    }
  }

  /**
   * Remove item from queue
   */
  static async removeFromQueue(itemId: string): Promise<void> {
    try {
      const queue = await this.getQueue();
      const filtered = queue.filter((item) => item.id !== itemId);
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
    } catch (error) {
      console.error('[OfflineStorage] Error removing from queue:', error);
    }
  }

  /**
   * Update queue item retry count
   */
  static async updateQueueItem(itemId: string, updates: Partial<OfflineQueueItem>): Promise<void> {
    try {
      const queue = await this.getQueue();
      const index = queue.findIndex((item) => item.id === itemId);
      if (index !== -1) {
        queue[index] = { ...queue[index], ...updates };
        await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
      }
    } catch (error) {
      console.error('[OfflineStorage] Error updating queue item:', error);
    }
  }

  /**
   * Clear offline queue
   */
  static async clearQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    } catch (error) {
      console.error('[OfflineStorage] Error clearing queue:', error);
    }
  }

  /**
   * Cache profile data
   */
  static async cacheProfile(profile: any): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PROFILE_CACHE, JSON.stringify(profile));
    } catch (error) {
      console.error('[OfflineStorage] Error caching profile:', error);
    }
  }

  /**
   * Get cached profile
   */
  static async getCachedProfile(): Promise<any | null> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.PROFILE_CACHE);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('[OfflineStorage] Error getting cached profile:', error);
      return null;
    }
  }

  /**
   * Clear all cached data
   */
  static async clearAll(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.ROSTERS_CACHE),
        AsyncStorage.removeItem(STORAGE_KEYS.ROSTERS_LAST_SYNC),
        AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE),
        AsyncStorage.removeItem(STORAGE_KEYS.PROFILE_CACHE),
        AsyncStorage.removeItem(STORAGE_KEYS.CONNECTIONS_CACHE),
      ]);
    } catch (error) {
      console.error('[OfflineStorage] Error clearing all:', error);
    }
  }
}






