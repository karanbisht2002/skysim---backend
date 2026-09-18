import { airaloSyncService } from "../airalo/airalo-sync";
import { storage } from "../../storage";
import { providerAutoSyncService } from "./providerAutoSyncService";

const LAST_SYNC_SETTING_KEY = "last_airalo_sync_timestamp";

/**
 * Automatic sync scheduler for Airalo packages
 * Syncs every hour to keep package data up-to-date
 */
export class SyncScheduler {
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private readonly SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour in milliseconds

  /**
   * Start the hourly sync scheduler
   */
  async start() {
    console.log("🕐 Starting hourly Airalo sync scheduler...");

    // Check database for last sync time
    const lastSyncTime = await this.getLastSyncTime();
    const now = Date.now();
    const timeSinceLastSync = lastSyncTime ? now - lastSyncTime : Infinity;

    if (timeSinceLastSync >= this.SYNC_INTERVAL_MS) {
      // More than 60 minutes since last sync (or no sync yet) - run now
      console.log("⏰ Running initial sync on startup...");
      this.runSync();
    } else {
      const minutesRemaining = Math.ceil((this.SYNC_INTERVAL_MS - timeSinceLastSync) / 1000 / 60);
      console.log(`⏭️  Skipping initial sync - last sync was ${Math.floor(timeSinceLastSync / 1000 / 60)} minutes ago`);
      console.log(`   Next sync will run in ${minutesRemaining} minutes`);
    }

    // Schedule hourly syncs
    this.syncInterval = setInterval(() => {
      this.runSync();
    }, this.SYNC_INTERVAL_MS);

    console.log(`✅ Sync scheduler started - will sync every ${this.SYNC_INTERVAL_MS / 1000 / 60} minutes`);
  }

  /**
   * Stop the sync scheduler
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log("🛑 Sync scheduler stopped");
    }
  }

  /**
   * Run a single sync operation
   */
  private async runSync() {
    if (this.isSyncing) {
      console.log("⏭️ Skipping sync - previous sync still in progress");
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      console.log(`\n🔄 Starting scheduled provider sync at ${new Date().toISOString()}`);

      // Use improved auto-sync service
      const result = await providerAutoSyncService.syncAll();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Scheduled sync completed in ${duration}s`);

      result.providers.forEach(p => {
        console.log(`\n📡 Provider: ${p.provider}`);
        console.log(`   ✔ Success: ${p.success}`);
        console.log(`   📦 Synced: ${p.packagesSynced} | Updated: ${p.packagesUpdated} | Removed: ${p.packagesRemoved}`);
        if (p.errorMessage) {
          console.log(`   ⚠️ Error: ${p.errorMessage}`);
        }
      });

      await this.saveLastSyncTime(Date.now());
    } catch (error: any) {
      console.error(`❌ Scheduled sync failed:`, error.message);
    } finally {
      this.isSyncing = false;
    }
  }


  /**
   * Get last sync time from database
   */
  private async getLastSyncTime(): Promise<number | null> {
    try {
      const setting = await storage.getSettingByKey(LAST_SYNC_SETTING_KEY);
      if (setting && setting.value) {
        const timestamp = parseInt(setting.value);
        return isNaN(timestamp) ? null : timestamp;
      }
    } catch (error) {
      console.warn("Failed to get last sync time from database:", error);
    }
    return null;
  }

  /**
   * Save last sync time to database
   */
  private async saveLastSyncTime(timestamp: number): Promise<void> {
    try {
      await storage.setSetting({
        key: LAST_SYNC_SETTING_KEY,
        value: timestamp.toString(),
        category: "system",
      });
    } catch (error) {
      console.warn("Failed to save last sync time to database:", error);
    }
  }

  /**
   * Trigger a manual sync immediately
   */
  async triggerManualSync() {
    console.log("🔧 Manual sync triggered");
    await this.runSync();
  }
}

// Export singleton instance
export const syncScheduler = new SyncScheduler();
