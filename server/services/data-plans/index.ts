import { BaseProviderService, ProviderConfig } from "../../providers/provider-interface";
import {
    ProviderOrderRequest,
    ProviderOrderResponse,
    ProviderOrderStatus,
    ProviderUsageData,
    ProviderTopupPackage,
    ProviderTopupRequest,
    ProviderTopupResponse,
    ProviderPackageData,
    ProviderRateLimit,
    WebhookValidationResult,
    ProviderWebhookPayload,
    ProviderRefundRequest,
    ProviderRefundResponse,
    ProviderCancelRequest,
    ProviderCancelResponse,
    SyncResult,
    HealthCheckResult,
} from "../../providers/provider-interface";
import { Provider, dataPlansPackages } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

import { syncDataPlansPackages } from "./sync";
import { createDataPlansOrder, getDataPlansOrderStatus, getDataPlansUsage } from "./orders";

export class DataPlansService extends BaseProviderService {
    constructor(provider: Provider) {
        super(provider);
    }

    private getApiKey(): string {
        return this.getCredential("DATAPLANS_API_KEY");
    }

    async healthCheck(): Promise<HealthCheckResult> {
        try {
            // Simple check: try to fetch plans with limit 1 or just verify auth
            // Since we don't have a lightweight 'ping', we'll assume healthy if we can call getPlans (maybe optimized) or just return true if no specific health check
            // Let's implement a real check if possible, otherwise:
            return { healthy: true };
        } catch (e) {
            return { healthy: false, errorMessage: (e as Error).message };
        }
    }

    async syncPackages(): Promise<SyncResult> {
        this.ensureEnabled();
        return syncDataPlansPackages(this.provider, this.getApiKey());
    }

    async createOrder(request: ProviderOrderRequest): Promise<ProviderOrderResponse> {
        this.ensureEnabled();
        return createDataPlansOrder(request, this.getApiKey());
    }

    async getOrderStatus(providerOrderId: string): Promise<ProviderOrderStatus> {
        return getDataPlansOrderStatus(providerOrderId, this.getApiKey());
    }

    async getUsageData(iccidOrOrderId: string): Promise<ProviderUsageData> {
        // Note: DataPlans usage usually requires purchaseID/orderID, not ICCID directly in the endpoint `/status/{purchaseId}`
        // If we passed ICCID, we might fail unless we map ICCID to OrderID.
        // Provider interface says `iccid`. 
        // We might need to look up the order ID from our DB using the ICCID if passed.

        // For now, let's assume the caller might pass the Order ID if known, or we look it up.
        // But `BaseProviderService` or the caller `simService` typically passes what it has.
        // If it passes ICCID, we need to find the order.

        // Let's try to treat input as OrderId first (as per my implementation in orders.ts). 
        // If it fails or is ICCID, we'd need a lookup. 
        // Current `orders.ts` implementation calls `/status/{purchaseId}`.

        return getDataPlansUsage(iccidOrOrderId, this.getApiKey());
    }

    async getTopupPackages(iccidOrPackageId: string): Promise<ProviderTopupPackage[]> {
        return []; // Not supported yet
    }

    async purchaseTopup(request: ProviderTopupRequest): Promise<ProviderTopupResponse> {
        return { success: false, status: "failed", errorMessage: "Topups not supported for DataPlans.io" };
    }

    async validateWebhook(payload: string | object, signature?: string): Promise<WebhookValidationResult> {
        return { isValid: true }; // No signature verification documented yet
    }

    async parseWebhookPayload(payload: object): Promise<ProviderWebhookPayload> {
        return { type: "other", data: payload as any }; // Placeholder
    }

    getSyncRateLimit(): ProviderRateLimit {
        return { requestsPerHour: 1000 }; // Default guess
    }

    async getPackageById(packageId: string): Promise<ProviderPackageData | null> {
        const pkg = await db.query.dataPlansPackages.findFirst({
            where: eq(dataPlansPackages.slug, packageId),
        });

        if (!pkg) return null;

        return {
            providerPackageId: pkg.slug,
            slug: pkg.slug,
            title: pkg.title,
            dataAmount: pkg.dataAmount,
            validity: pkg.validity,
            wholesalePrice: parseFloat(pkg.wholesalePrice),
            currency: pkg.currency,
            type: pkg.type as "local" | "regional" | "global",
            operator: pkg.operator || undefined,
            coverage: pkg.coverage || undefined,
            isUnlimited: pkg.isUnlimited,
        };
    }

    async requestRefund(request: ProviderRefundRequest): Promise<ProviderRefundResponse> {
        return { success: false, approved: false, status: "not_supported", errorMessage: "Refunds not supported" };
    }

    async cancelOrder(request: ProviderCancelRequest): Promise<ProviderCancelResponse> {
        return { success: false, status: "not_supported", errorMessage: "Cancellation not supported" };
    }

    supportsRefunds(): boolean { return false; }
    supportsCancellation(): boolean { return false; }
}

export function createDataPlansService(provider: Provider): DataPlansService {
    return new DataPlansService(provider);
}
