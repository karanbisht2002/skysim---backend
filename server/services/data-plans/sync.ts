import { db } from "../../db";
import { dataPlansPackages, Provider } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { getPlans } from "./api-client";
import { SyncResult } from "../../providers/provider-interface";

export async function syncDataPlansPackages(
    provider: Provider,
    apiKey: string
): Promise<SyncResult> {
    const result: SyncResult = {
        success: false,
        packagesSynced: 0,
        packagesUpdated: 0,
        packagesRemoved: 0,
    };

    try {
        const plans = await getPlans(apiKey);

        if (!plans || plans.length === 0) {
            console.warn("[DataPlans] No plans returned from API");
            result.success = true;
            return result;
        }

        const currentPackages = await db.query.dataPlansPackages.findMany({
            columns: { slug: true },
        });
        const currentSlugs = new Set(currentPackages.map((p) => p.slug));
        const apiSlugs = new Set<string>();

        for (const plan of plans) {
            if (!plan.active) continue;

            apiSlugs.add(plan.slug);

            const existing = await db.query.dataPlansPackages.findFirst({
                where: eq(dataPlansPackages.slug, plan.slug),
            });

            // Calculate data in MB
            let dataMb = 0;
            if (plan.capacityUnit === "GB") {
                dataMb = plan.capacity * 1024;
            } else if (plan.capacityUnit === "MB") {
                dataMb = plan.capacity;
            }

            const coverage = plan.countries.map((c) => c.countryCode);
            // Determine type based on coverage size
            let type = "local";
            if (plan.region && plan.region.slug !== "global") {
                type = "regional";
            } else if (coverage.length > 5 && plan.region?.slug === "global") {
                type = "global";
            }

            const packageData = {
                providerId: provider.id,
                slug: plan.slug,
                destinationId: null, // To be mapped later by admin or auto-matcher
                regionId: null,      // To be mapped later
                title: plan.name,
                dataAmount: `${plan.capacity} ${plan.capacityUnit}`,
                dataMb,
                validity: plan.period,
                wholesalePrice: plan.retailPrice.toString(), // Using retail as wholesale base since we likely get a discount on top? API docs don't specify wholesale vs retail clearly, assuming retail price IS our cost or close to it.
                currency: plan.priceCurrency,
                type,
                operator: plan.operator?.name,
                operatorImage: null, // API doesn't provide image URL directly usually
                coverage,
                isUnlimited: false, // API responses might clarify if unlimited, but based on capacity it seems fixed.
                active: true,
            };

            if (existing) {
                // Update
                await db
                    .update(dataPlansPackages)
                    .set({
                        ...packageData,
                        updatedAt: new Date(),
                    })
                    .where(eq(dataPlansPackages.slug, plan.slug));
                result.packagesUpdated++;
            } else {
                // Insert
                await db.insert(dataPlansPackages).values(packageData);
                result.packagesSynced++;
            }
        }

        // Mark removed packages as inactive
        const toRemove = [...currentSlugs].filter((s) => !apiSlugs.has(s));
        if (toRemove.length > 0) {
            await db
                .update(dataPlansPackages)
                .set({ active: false, updatedAt: new Date() })
                .where(inArray(dataPlansPackages.slug, toRemove));
            result.packagesRemoved = toRemove.length;
        }

        result.success = true;
    } catch (error) {
        console.error("[DataPlans] Sync error:", error);
        result.errorMessage = (error as Error).message;
    }

    return result;
}
