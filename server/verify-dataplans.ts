
import { db } from "./db";
import { providers } from "@shared/schema";
import { eq } from "drizzle-orm";
import "../server/providers/register"; // Ensure registration happens
import { providerFactory } from "../server/providers/factory";

async function verifyDataPlans() {
    console.log("🔍 Verifying DataPlans.io Implementation...");

    try {
        // 1. Check if provider seeded (requires running seed first, but we can check if it exists or insert dummy)
        let provider = await db.query.providers.findFirst({
            where: eq(providers.slug, "data-plans")
        });

        if (!provider) {
            console.log("⚠️ Provider not found in DB. Seeding it temporarily...");
            // Insert if not exists for testing
            const [inserted] = await db.insert(providers).values({
                name: "DataPlans.io",
                slug: "data-plans",
                apiBaseUrl: "https://app.dataplans.io/api/v1",
                enabled: true
            }).returning();
            provider = inserted;
        } else {
            console.log("✅ Provider found in DB");
        }

        // 2. Get Service
        const service = providerFactory.getService(provider);
        console.log("✅ Service instantiated successfully");

        // 3. Health Check
        console.log("running health check...");
        const health = await service.healthCheck();
        console.log("Health Check Result:", health);

        // 4. Check Sync (Mocking might be needed if no API key)
        // We won't run full sync to avoid polluting DB or failing on missing key, but checking existence of method is good.
        if (typeof service.syncPackages === 'function') {
            console.log("✅ syncPackages method exists");
        }

        console.log("🎉 Verification Finished");

    } catch (error) {
        console.error("❌ Verification Failed:", error);
        process.exit(1);
    }
}

verifyDataPlans()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
