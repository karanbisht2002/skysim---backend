"use strict";

import { db } from "../../db";
import { providers } from "@shared/schema";
import { eq, or } from "drizzle-orm";

export class ProviderAutoSyncService {
    async syncAll() {
        // Fetch all providers that should be synced
        const providerList = await db.query.providers.findMany({
            where: or(
                eq(providers.slug, "airalo"),
                eq(providers.slug, "esim-access"),
                eq(providers.slug, "esim-go"),
                eq(providers.slug, "maya")
            ),
        });

        if (!providerList || providerList.length === 0) {
            return { success: false, message: "No providers found for auto sync" };
        }

        const { providerFactory } = await import("../../providers/provider-factory");
        const { unifiedPackagesSyncService } = await import("../sync/unified-packages-sync");

        const results = [];

        for (const provider of providerList) {
            if (!provider.enabled) {
                results.push({
                    provider: provider.slug,
                    success: false,
                    message: "Provider disabled, skipping",
                });
                continue;
            }

            try {
                // Load provider service
                const service = await providerFactory.getServiceById(provider.id);

                // Run sync
                const syncResult = await service.syncPackages();

                // Update last sync timestamp
                await db.update(providers)
                    .set({ lastSyncAt: new Date() })
                    .where(eq(providers.id, provider.id));

                // Sync unified packages
                if (syncResult.success) {
                    await unifiedPackagesSyncService.syncProviderPackages(provider.slug);
                }

                results.push({
                    provider: provider.slug,
                    success: syncResult.success,
                    packagesSynced: syncResult.packagesSynced,
                    packagesUpdated: syncResult.packagesUpdated,
                    packagesRemoved: syncResult.packagesRemoved,
                    errorMessage: syncResult.errorMessage || null,
                });

            } catch (err: any) {
                results.push({
                    provider: provider.slug,
                    success: false,
                    message: err.message,
                });
            }
        }

        // Clear service cache after all syncs
        providerFactory.clearCache();

        return {
            success: true,
            message: "Auto sync completed",
            providers: results,
        };
    }
}

export const providerAutoSyncService = new ProviderAutoSyncService();