import axios, { AxiosInstance, AxiosError } from "axios";
import { DataPlansPlan, DataPlansPurchaseResponse, DataPlansStatusResponse } from "./types";

const BASE_URL = "https://app.dataplans.io/api/v1";

const createClient = (apiKey: string): AxiosInstance => {
    return axios.create({
        baseURL: BASE_URL,
        headers: {
            Authorization: apiKey, // "jwt" security scheme in swagger often means Bearer or direct token. Swagger says "jwt": [] in security, and "in: header", name: "Authorization".
            // Usually it's `Bearer ${apiKey}` but sometimes just the key. Let's try direct first as per "Authorization" header name.
            // Wait, "securityDefinitions": {"jwt": {"type": "apiKey", "name": "Authorization", "in": "header"}}
            // This usually implies the value is the key.
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        timeout: 30000,
    });
};

export const getPlans = async (apiKey: string): Promise<DataPlansPlan[]> => {
    const client = createClient(apiKey);
    try {
        const response = await client.get<DataPlansPlan[]>("/plans");
        return response.data;
    } catch (error) {
        handleError(error, "getPlans");
        throw error;
    }
};

export const purchaseTargetPlan = async (
    apiKey: string,
    slug: string,
    includeQRDataURL: boolean = false
): Promise<DataPlansPurchaseResponse> => {
    const client = createClient(apiKey);
    try {
        const response = await client.post<DataPlansPurchaseResponse>("/purchases", {
            slug,
            includeQRDataURL,
        });
        return response.data;
    } catch (error) {
        handleError(error, "purchasePlan");
        throw error;
    }
};

export const getPurchaseStatus = async (
    apiKey: string,
    purchaseId: string
): Promise<DataPlansStatusResponse> => {
    const client = createClient(apiKey);
    try {
        // Determine which endpoint to use. Swagger has /status/{purchaseId}
        const response = await client.get<DataPlansStatusResponse>(`/status/${purchaseId}`);
        return response.data;
    } catch (error) {
        handleError(error, "getPurchaseStatus");
        throw error;
    }
};

function handleError(error: unknown, context: string) {
    if (axios.isAxiosError(error)) {
        console.error(
            `[DataPlans] ${context} error:`,
            error.response?.status,
            error.response?.data
        );
    } else {
        console.error(`[DataPlans] ${context} error:`, error);
    }
}
