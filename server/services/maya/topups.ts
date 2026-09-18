"use strict";

import { getMayaProducts, getMayaEsim, changeMayaEsim, getMayaEsimPlans } from "./api-client";
import { formatDataAmount } from "./types";
import { db } from "../../db";
import { mayaPackages, countryCodeMappings } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type {
  ProviderTopupPackage,
  ProviderTopupRequest,
  ProviderTopupResponse,
} from "../../providers/provider-interface";
import type { MayaProductsResponse, MayaGetEsimResponse, MayaChangeEsimResponse, MayaGetPlansResponse, MayaProduct } from "./types";

export async function getMayaTopupPackages(
  iccidOrProductUid: string,
  apiKey: string,
  apiSecret: string
): Promise<ProviderTopupPackage[]> {
  try {
    const esimResponse = await getMayaEsim(
      iccidOrProductUid,
      apiKey,
      apiSecret
    ) as MayaGetEsimResponse;

    if (!esimResponse.esim) {
      console.warn("[Maya] eSIM not found, attempting to get products for country");
      return [];
    }

    const esim = esimResponse.esim;


    console.log("[Maya] eSIM details:", esim);

    const plansResponse = await getMayaEsimPlans(
      iccidOrProductUid,
      apiKey,
      apiSecret
    ) as MayaGetPlansResponse;

    console.log("[Maya] eSIM plans response:", plansResponse);

    if (!plansResponse.plans || plansResponse.plans.length === 0) {
      return [];
    }

    let activePlan = plansResponse.plans.find(p => p.status === "active");

    // Fallback to first plan if none are active (e.g. pending or just not active yet)
    if (!activePlan && plansResponse.plans.length > 0) {
      activePlan = plansResponse.plans[0];
    }

    if (!activePlan) {
      console.warn("[Maya] No plan found for eSIM to match topup packages");
      return [];
    }

    // Extract metadata from the active plan, handling different API response structures
    const planType = (activePlan as any).plan_type;
    const planCountries = (activePlan as any).countries_enabled as string[];
    console.log("[Maya] Plan countries enabled:", planCountries);
    const productUid = planType?.plan_type_id || (activePlan as any).product_uid;
    const planName = planType?.plan_name || (activePlan as any).product_name || "";

    // Identify the current plan's coverage for direct API filtering
    let dbPkg: any = null;
    if (productUid) {
      try {
        dbPkg = await db.query.mayaPackages.findFirst({
          where: eq(mayaPackages.mayaId, productUid),
        });
      } catch (error) {
        console.warn("[Maya] DB lookup failed for package metadata:", productUid);
      }
    }

    const filters: { country?: string; region?: string } = {};
    let manualFilterPrefix: string | null = null;

    // 1. Try to use countries_enabled from the API response directly
    if (planCountries && planCountries.length === 1) {
      const countryCode = planCountries[0].toLowerCase();
      if (countryCode.length === 2) {
        filters.country = countryCode;
      } else {
        // Resolve 3-letter codes (like USA) to 2-letter codes (like US)
        const mapping = await db.query.countryCodeMappings.findFirst({
          where: eq(countryCodeMappings.externalCode, planCountries[0].toUpperCase()),
        });
        if (mapping && mapping.internalCode.length === 2) {
          filters.country = mapping.internalCode.toLowerCase();
        } else {
          manualFilterPrefix = planName.split(/\d/)[0]?.trim();
        }
      }
    } else if (dbPkg) {
      // 2. Try the database package metadata
      if (dbPkg.type === "local" && dbPkg.coverage && dbPkg.coverage.length > 0) {
        // Our normalized coverage is usually ISO2 already
        const code = dbPkg.coverage[0].toLowerCase();
        if (code.length === 2) {
          filters.country = code;
        } else {
          const mapping = await db.query.countryCodeMappings.findFirst({
            where: eq(countryCodeMappings.internalCode, dbPkg.coverage[0]),
          });
          if (mapping && mapping.internalCode.length === 2) {
            filters.country = mapping.internalCode.toLowerCase();
          }
        }
      } else if (dbPkg.type === "regional") {
        const title = dbPkg.title.toLowerCase();
        if (title.includes("europe")) filters.region = "europe";
        else if (title.includes("asia")) filters.region = "asia";
        else if (title.includes("latin america")) filters.region = "latin-america";
        else if (title.includes("north america")) filters.region = "north-america";
        else if (title.includes("caribbean")) filters.region = "caribbean";
        else if (title.includes("middle east") || title.includes("africa")) filters.region = "middle-east-africa";
        else if (title.includes("global")) filters.region = "global";

        if (!filters.region) {
          manualFilterPrefix = dbPkg.title.split(/\d/)[0]?.trim();
        }
      } else {
        manualFilterPrefix = dbPkg.title.split(/\d/)[0]?.trim();
      }
    } else {
      // 3. Fallback: extract prefix if we don't have metadata
      manualFilterPrefix = planName.split(/\d/)[0]?.trim();

      // If the prefix looks like an ISO2 code
      if (manualFilterPrefix && manualFilterPrefix.length === 2) {
        filters.country = manualFilterPrefix.toLowerCase();
        manualFilterPrefix = null;
      }
    }


    console.log("[Maya] Fetching products with filters:", filters, "and manual prefix:", manualFilterPrefix);

    const productsResponse = await getMayaProducts(
      apiKey,
      apiSecret,
      filters
    ) as MayaProductsResponse;

    if (!productsResponse.products) {
      return [];
    }

    const topupPackages: ProviderTopupPackage[] = productsResponse.products
      .filter(product => {
        if (!manualFilterPrefix) return true;
        // Secondary safety filter if API results are too broad or we couldn't resolve a precise filter
        return product.name.toLowerCase().includes(manualFilterPrefix.toLowerCase());
      })
      .map(product => ({
        providerPackageId: product.uid,
        title: product.name,
        dataAmount: formatDataAmount(product.data_quota_mb),
        validity: product.validity_days,
        wholesalePrice: parseFloat(product.wholesale_price_usd) || 0,
        currency: "USD",
      }));

    return topupPackages;
  } catch (error) {
    console.error("[Maya] Get topup packages failed:", error);
    return [];
  }
}

export async function purchaseMayaTopup(
  request: ProviderTopupRequest,
  apiKey: string,
  apiSecret: string
): Promise<ProviderTopupResponse> {
  try {
    if (!request.iccid) {
      return {
        success: false,
        status: "failed",
        errorMessage: "ICCID is required for Maya topup",
      };
    }

    const response = await changeMayaEsim(
      request.iccid,
      "add_package",
      apiKey,
      apiSecret,
      request.packageId
    ) as MayaChangeEsimResponse;

    if (response.result !== 1 && response.result !== 0) {
      return {
        success: false,
        status: "failed",
        errorMessage: response.message || "Failed to add package to eSIM",
      };
    }

    const newPlan = response.esim?.plans?.find(p =>
      p.product_uid === request.packageId && p.status === "active"
    );

    return {
      success: true,
      providerTopupId: newPlan?.id || response.request_id,
      requestId: response.request_id,
      status: "completed",
    };
  } catch (error) {
    console.error("[Maya] Purchase topup failed:", error);
    return {
      success: false,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function suspendMayaEsim(
  esimId: string,
  apiKey: string,
  apiSecret: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await changeMayaEsim(
      esimId,
      "suspend",
      apiKey,
      apiSecret
    ) as MayaChangeEsimResponse;

    return {
      success: true,
      message: response.message || "eSIM suspended successfully",
    };
  } catch (error) {
    console.error("[Maya] Suspend eSIM failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function reactivateMayaEsim(
  esimId: string,
  apiKey: string,
  apiSecret: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await changeMayaEsim(
      esimId,
      "reactivate",
      apiKey,
      apiSecret
    ) as MayaChangeEsimResponse;

    return {
      success: true,
      message: response.message || "eSIM reactivated successfully",
    };
  } catch (error) {
    console.error("[Maya] Reactivate eSIM failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
