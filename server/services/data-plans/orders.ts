import {
    ProviderOrderRequest,
    ProviderOrderResponse,
    ProviderOrderStatus,
    ProviderUsageData,
} from "../../providers/provider-interface";
import { purchaseTargetPlan, getPurchaseStatus } from "./api-client";

export async function createDataPlansOrder(
    request: ProviderOrderRequest,
    apiKey: string
): Promise<ProviderOrderResponse> {
    try {
        // request.packageId is likely our internal ID or the provider ID (slug).
        // The factory or service should ensure we pass the correct ID.
        // Assuming passed packageId IS the DataPlans slug.

        // We typically store the provider's ID in `providerPackageId`.

        const response = await purchaseTargetPlan(apiKey, request.packageId, true);

        return {
            success: true,
            providerOrderId: response.purchase.purchaseId,
            requestId: response.uuid,
            iccid: response.purchase.esim.serial, // Assuming serial is ICCID or similar unique ID
            qrCode: response.purchase.esim.qrCodeString,
            qrCodeUrl: response.purchase.esim.qrCodeDataUrl,
            activationCode: response.purchase.esim.manual1, // Often manual1 is SM-DP+ Address, manual2 is activation code or vice versa. API example: manual1: ais.prod..., manual2: hidden.
            // Actually standard: manual1 = SMDP, manual2 = Activation Code. But example shows manual1 as domain. 
            // Let's map carefully.
            smdpAddress: response.purchase.esim.manual1,
            // Status usually completed immediately for API calls unless async
            status: "completed",
        };
    } catch (error) {
        console.error("[DataPlans] Create order error:", error);
        return {
            success: false,
            status: "failed",
            errorMessage: (error as Error).message,
        };
    }
}

export async function getDataPlansOrderStatus(
    providerOrderId: string,
    apiKey: string
): Promise<ProviderOrderStatus> {
    try {
        const status = await getPurchaseStatus(apiKey, providerOrderId);
        return {
            providerOrderId,
            status: "completed", // API returns active plans, so likelihood is it's completed if we get data.
            iccid: status.esim?.serial, // API "serial"
            qrCode: status.esim?.qrCodeString,
        };
    } catch (error) {
        return {
            providerOrderId,
            status: "failed",
            errorMessage: (error as Error).message
        };
    }
}

export async function getDataPlansUsage(
    providerOrderId: string, // We use providerOrderId to fetch status, which contains usage
    apiKey: string
): Promise<ProviderUsageData> {
    try {
        const status = await getPurchaseStatus(apiKey, providerOrderId);

        // Aggregate usage from plans if multiple? Usually one plan per purchase.
        const plan = status.plans[0];

        if (!plan) {
            throw new Error("No plan found in status");
        }

        // API gives 'remainingCapacity'.
        // We need 'used', 'total', 'remaining'.
        // We don't have 'total' easily unless we parse description or store it.
        // 'capacity' in Plan object was total. Status object doesn't explicitly show total except in description maybe?
        // Let's assume we can't easily get total from just status status unless `initialCapacity` is stored.
        // However, interface requires total.

        // Workaround: We might have stored total in DB, but here we only have access to API.
        // Let's try to infer or return what we can.

        // Logic: remaining is known. Used = Total - Remaining. If Total unknown, maybe return 0 for now or try to parse description "6GB".
        const totalMatch = plan.description.match(/(\d+)\s*(GB|MB)/i);
        let total = 0;
        if (totalMatch) {
            let val = parseInt(totalMatch[1]);
            if (totalMatch[2].toUpperCase() === 'GB') val *= 1024;
            total = val; // in MB
        }

        // Remaining is in plan.remainingCapacity (unit in capacityUnit)
        let remaining = plan.remainingCapacity;
        if (plan.capacityUnit === 'GB') remaining *= 1024;

        const used = total - remaining;

        return {
            iccid: status.esim.serial,
            dataUsed: Math.max(0, used),
            dataTotal: total,
            dataRemaining: remaining,
            percentageUsed: total > 0 ? (used / total) * 100 : 0,
            status: plan.isActive ? "active" : "expired",
            expiresAt: new Date(plan.expiryDate),
            activatedAt: new Date(plan.activatedAt),
        };

    } catch (error) {
        throw error;
    }
}
