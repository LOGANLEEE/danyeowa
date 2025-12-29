import { supabase } from '@/lib/supabase/client';
import { OfflineStorage, OfflineQueueItem } from '@/lib/offline-storage';
import { Roster } from '@/lib/supabase/types';

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  current?: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

/**
 * Sync Service
 * Handles syncing offline operations when connection is restored
 */
export class SyncService {
  private static isSyncing = false;
  private static progressCallback: SyncProgressCallback | null = null;

  /**
   * Set progress callback
   */
  static setProgressCallback(callback: SyncProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /**
   * Check if sync is in progress
   */
  static isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Sync all queued operations
   */
  static async syncAll(userId: string): Promise<{ success: number; failed: number; errors: Error[] }> {
    if (this.isSyncing) {
      return { success: 0, failed: 0, errors: [] };
    }

    this.isSyncing = true;
    const errors: Error[] = [];
    let success = 0;
    let failed = 0;

    try {
      const queue = await OfflineStorage.getQueue();
      const userQueue = queue.filter((item) => item.userId === userId);
      
      if (userQueue.length === 0) {
        this.isSyncing = false;
        return { success: 0, failed: 0, errors: [] };
      }

      const total = userQueue.length;
      this.reportProgress({ total, completed: 0, failed: 0 });

      // Sort by timestamp (oldest first)
      const sortedQueue = [...userQueue].sort((a, b) => a.timestamp - b.timestamp);

      for (const item of sortedQueue) {
        this.reportProgress({
          total,
          completed: success,
          failed,
          current: `${item.type} ${item.table}`,
        });

        try {
          const result = await this.syncItem(item);
          
          if (result.success) {
            await OfflineStorage.removeFromQueue(item.id);
            success++;
          } else {
            // Increment retry count
            const newRetries = item.retries + 1;
            await OfflineStorage.updateQueueItem(item.id, { retries: newRetries });

            // Remove if too many retries (max 3)
            if (newRetries >= 3) {
              await OfflineStorage.removeFromQueue(item.id);
              errors.push(new Error(`Max retries reached for ${item.type} ${item.table}`));
            } else {
              errors.push(result.error || new Error(`Failed to sync ${item.type} ${item.table}`));
            }
            failed++;
          }
        } catch (error) {
          console.error(`[SyncService] Error syncing item ${item.id}:`, error);
          const newRetries = item.retries + 1;
          await OfflineStorage.updateQueueItem(item.id, { retries: newRetries });

          if (newRetries >= 3) {
            await OfflineStorage.removeFromQueue(item.id);
          }
          
          errors.push(error instanceof Error ? error : new Error('Unknown sync error'));
          failed++;
        }

        this.reportProgress({
          total,
          completed: success,
          failed,
        });
      }

      // Update last sync time
      await OfflineStorage.cacheRosters(
        (await OfflineStorage.getCachedRosters()) || []
      );

      return { success, failed, errors };
    } catch (error) {
      console.error('[SyncService] Error in syncAll:', error);
      errors.push(error instanceof Error ? error : new Error('Sync failed'));
      return { success, failed, errors };
    } finally {
      this.isSyncing = false;
      this.reportProgress({ total: 0, completed: 0, failed: 0 });
    }
  }

  /**
   * Sync a single queue item
   */
  private static async syncItem(item: OfflineQueueItem): Promise<{ success: boolean; error?: Error }> {
    try {
      switch (item.type) {
        case 'create':
          return await this.syncCreate(item);
        case 'update':
          return await this.syncUpdate(item);
        case 'delete':
          return await this.syncDelete(item);
        default:
          return { success: false, error: new Error(`Unknown operation type: ${item.type}`) };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Sync item failed'),
      };
    }
  }

  /**
   * Sync create operation
   */
  private static async syncCreate(item: OfflineQueueItem): Promise<{ success: boolean; error?: Error }> {
    try {
      const { data, error } = await supabase
        .from(item.table)
        .insert(item.data)
        .select()
        .single();

      if (error) {
        return { success: false, error: new Error(error.message) };
      }

      // Update cache if rosters
      if (item.table === 'rosters' && data) {
        const cached = await OfflineStorage.getCachedRosters();
        if (cached) {
          const updated = [...cached, data as Roster];
          await OfflineStorage.cacheRosters(updated);
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Create sync failed'),
      };
    }
  }

  /**
   * Sync update operation
   */
  private static async syncUpdate(item: OfflineQueueItem): Promise<{ success: boolean; error?: Error }> {
    try {
      const { id, ...updateData } = item.data;
      
      const { data, error } = await supabase
        .from(item.table)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return { success: false, error: new Error(error.message) };
      }

      // Update cache if rosters
      if (item.table === 'rosters' && data) {
        const cached = await OfflineStorage.getCachedRosters();
        if (cached) {
          const updated = cached.map((r) => (r.id === id ? (data as Roster) : r));
          await OfflineStorage.cacheRosters(updated);
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Update sync failed'),
      };
    }
  }

  /**
   * Sync delete operation
   */
  private static async syncDelete(item: OfflineQueueItem): Promise<{ success: boolean; error?: Error }> {
    try {
      const { id } = item.data;
      
      const { error } = await supabase
        .from(item.table)
        .delete()
        .eq('id', id);

      if (error) {
        return { success: false, error: new Error(error.message) };
      }

      // Update cache if rosters
      if (item.table === 'rosters') {
        const cached = await OfflineStorage.getCachedRosters();
        if (cached) {
          const updated = cached.filter((r) => r.id !== id);
          await OfflineStorage.cacheRosters(updated);
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Delete sync failed'),
      };
    }
  }

  /**
   * Report sync progress
   */
  private static reportProgress(progress: SyncProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}

