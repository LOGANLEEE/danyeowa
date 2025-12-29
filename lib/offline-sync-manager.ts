import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/lib/supabase/client';
import { SyncService } from '@/lib/sync-service';

/**
 * Offline Sync Manager
 * Automatically syncs when network connection is restored
 */
export class OfflineSyncManager {
  private static unsubscribe: (() => void) | null = null;
  private static isInitialized = false;

  /**
   * Initialize sync manager
   * Sets up network listener to auto-sync on reconnect
   */
  static initialize(): void {
    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;

    // Listen for network state changes
    this.unsubscribe = NetInfo.addEventListener(async (state) => {
      const isConnected = state.isConnected ?? false;

      if (isConnected) {
        await this.sync();
      }
    });
  }

  /**
   * Manually trigger sync
   */
  static async sync(): Promise<void> {
    try {
      // Get current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return;
      }

      // Check if already syncing
      if (SyncService.isSyncInProgress()) {
        return;
      }

      // Sync all queued operations
      await SyncService.syncAll(user.id);
    } catch (error) {
      console.error('[OfflineSyncManager] Error during sync:', error);
    }
  }

  /**
   * Cleanup
   */
  static cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isInitialized = false;
  }
}

