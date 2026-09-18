export interface DataPlansPlan {
    id: number;
    slug: string;
    name: string;
    period: number; // days
    capacity: number; // integer
    capacityUnit: string; // MB, GB
    retailPrice: number;
    priceCurrency: string;
    prepaidCredit: number;
    prepaidCurrency: string;
    reloadable: boolean;
    phoneNumber: boolean;
    active: boolean;
    slugToShow: string;
    operator: {
        slug: string;
        name: string;
    };
    region: {
        slug: string;
        name: string;
    };
    countries: Array<{
        countryCode: string;
        countryName: string;
    }>;
}

export interface DataPlansPurchaseResponse {
    purchase: {
        purchaseId: string;
        planSlug: string;
        retail: string;
        paid: string;
        currency: string;
        purchasedAt: string;
        esim: {
            manual1: string;
            manual2: string;
            optionalCode: string;
            phone: string;
            serial: string;
            expiryDate: string;
            qrCodeString: string;
            qrCodeDataUrl?: string;
        };
        planName: string;
    };
    availableBalance: string;
    uuid: string;
}

export interface DataPlansStatusResponse {
    purchaseId: string;
    plans: Array<{
        slug: string;
        description: string;
        isActive: boolean;
        remainingCapacity: number;
        capacityUnit: string;
        activatedAt: string;
        expiryDate: string;
        accountAge: number;
    }>;
    esim: {
        manual1: string;
        manual2: string;
        optionalCode: string;
        qrCodeString: string;
        phone: string;
        serial: string;
        expiryDate: string;
        balanceCurrency: string;
        currentBalance: number;
        lastBalance: number;
    };
}

export interface DataPlansWebhookPayload {
    // Placeholder based on typical webhook structures, needing adjustment if docs provided
    type: string;
    payload: any;
}
