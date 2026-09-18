import { airaloAPI } from "./airalo/airalo-sdk";
import { db } from "../db";
import { orders } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import QRCode from "qrcode";

/**
 * Generate QR code data URL from an LPA string
 */
async function generateQRCodeDataUrl(lpaString: string): Promise<string> {
  try {
    return await QRCode.toDataURL(lpaString, {
      width: 256,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    throw error;
  }
}

/**
 * eSIM Management Service
 * Handles eSIM details, installation instructions, usage tracking, and brand management
 */
export class ESimService {
  /**
   * Get eSIM details from Airalo API
   */
  async getESimDetails(iccid: string) {
    try {
      const response = await airaloAPI.getSimDetails(iccid);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch eSIM details for ${iccid}:`, error.message);
      throw new Error(`Failed to fetch eSIM details: ${error.message}`);
    }
  }

  /**
   * Get list of eSIMs with optional filters
   */
  async getESimsList(params?: {
    orderId?: string;
    iccid?: string;
    dateRange?: string;
    limit?: number;
    page?: number;
  }) {
    try {
      const airaloParams: any = {
        include: "order,order.status",
        limit: params?.limit || 50,
        page: params?.page || 1,
      };

      if (params?.orderId) {
        airaloParams["filter[order_id]"] = params.orderId;
      }
      if (params?.iccid) {
        airaloParams["filter[iccid]"] = params.iccid;
      }
      if (params?.dateRange) {
        airaloParams["filter[created_at]"] = params.dateRange;
      }

      const response = await airaloAPI.getSimsList(airaloParams);
      return response.data;
    } catch (error: any) {
      console.error("Failed to fetch eSIMs list:", error.message);
      throw new Error(`Failed to fetch eSIMs list: ${error.message}`);
    }
  }

  /**
   * Get installation instructions for eSIM
   * First checks database for cached QR codes, then falls back to Airalo API
   */
  async getInstallationInstructions(
    iccid: string,
    language: string = "en",
    device?: string,
    model?: string
  ) {
    try {
      // First, check if we have QR code data in our database
      const order = await db.query.orders.findFirst({
        where: eq(orders.iccid, iccid),
      });

      // If we have cached QR code data, use it
      if (order && (order.qrCodeUrl || order.qrCode || order.lpaCode || order.activationCode)) {
        console.log(`📱 Using cached QR code data for ${iccid}`);
        
        // Determine the QR code value
        let qrCodeValue = order.qrCodeUrl || order.qrCode;
        const lpaCode = order.lpaCode || order.activationCode || order.qrCode;
        
        // If qrCodeValue is an LPA string (not a URL), generate a QR code image
        if (qrCodeValue && qrCodeValue.startsWith("LPA:")) {
          console.log(`🔲 Generating QR code image from LPA string for ${iccid}`);
          qrCodeValue = await generateQRCodeDataUrl(qrCodeValue);
        } else if (!qrCodeValue && lpaCode) {
          // No QR code URL but we have an LPA code - generate QR from it
          console.log(`🔲 Generating QR code image from activation code for ${iccid}`);
          qrCodeValue = await generateQRCodeDataUrl(lpaCode);
        }
        
        return {
          qr_code: qrCodeValue,
          manual_code: lpaCode,
          smdp_address: order.smdpAddress,
          activation_code: order.activationCode,
          apn_type: order.apnType,
          apn_value: order.apnValue,
          is_roaming: order.isRoaming,
          direct_apple_url: order.directAppleUrl,
          steps: [], // Can be populated from Airalo API if needed
        };
      }

      // Fallback to Airalo API if no cached data
      console.log(`🌐 Fetching installation instructions from Airalo for ${iccid}`);
      const params: any = { language };
      if (device) params.device = device;
      if (model) params.model = model;

      const response = await airaloAPI.getInstallationInstructions(iccid, params);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch installation instructions for ${iccid}:`, error.message);
      throw new Error(`Failed to fetch installation instructions: ${error.message}`);
    }
  }

  /**
   * Get data usage for eSIM
   * Routes to correct provider service based on providerId
   */
  async getDataUsage(iccid: string, providerId?: string | null) {
    try {
      let response;
      
      // Route to correct provider service based on providerId
      if (providerId) {
        // Multi-provider order - use ProviderFactory
        const { providerFactory } = await import("../providers/provider-factory");
        const providerService = await providerFactory.getServiceById(providerId);
        const providerUsageData = await providerService.getUsageData(iccid);
        
        // Map provider response to database format with null guards
        const dataRemainingGB = providerUsageData.dataRemaining != null 
          ? (providerUsageData.dataRemaining / (1024 * 1024 * 1024)).toFixed(2) 
          : null;
        const dataTotalGB = providerUsageData.dataTotal != null 
          ? (providerUsageData.dataTotal / (1024 * 1024 * 1024)).toFixed(2) 
          : null;
        const percentageRemaining = providerUsageData.percentageUsed != null
          ? 100 - providerUsageData.percentageUsed
          : null;
        
        response = {
          data: {
            remaining: dataRemainingGB,
            total: dataTotalGB,
            remaining_voice: null,
            remaining_text: null,
            percentage: percentageRemaining,
            activated_at: providerUsageData.activatedAt,
            expires_at: providerUsageData.expiresAt,
            status: providerUsageData.status,
          },
        };
      } else {
        // Legacy Airalo order
        response = await airaloAPI.getUsage(iccid);
      }
      
      // Update usage in database with null guards
      const usageData = {
        remaining: response.data.remaining,
        total: response.data.total,
        remaining_voice: response.data.remaining_voice,
        remaining_text: response.data.remaining_text,
        percentage: response.data.percentage || (response.data.remaining && response.data.total 
          ? Math.round((parseFloat(response.data.remaining) / parseFloat(response.data.total)) * 100)
          : 0),
      };

      // Update order with latest usage
      await db.update(orders)
        .set({ 
          usageData,
          updatedAt: new Date(),
        })
        .where(eq(orders.iccid, iccid));

      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch data usage for ${iccid}:`, error.message);
      throw new Error(`Failed to fetch data usage: ${error.message}`);
    }
  }

  /**
   * Get available top-up packages for eSIM
   */
  async getTopupPackages(iccid: string) {
    try {
      const response = await airaloAPI.getTopupPackages(iccid);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch top-up packages for ${iccid}:`, error.message);
      throw new Error(`Failed to fetch top-up packages: ${error.message}`);
    }
  }

  /**
   * Update eSIM brand settings
   */
  async updateBrandSettings(iccid: string, brandName: string) {
    try {
      const response = await airaloAPI.updateSimBrand(iccid, brandName);
      console.log(`✅ Updated brand for ${iccid} to: ${brandName}`);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to update brand for ${iccid}:`, error.message);
      throw new Error(`Failed to update brand settings: ${error.message}`);
    }
  }

  /**
   * Sync eSIM usage for all active orders
   * Called by background job to keep usage data fresh
   * Routes to correct provider service for each order with per-provider rate limiting
   */
  async syncAllActiveESimUsage() {
    try {
      // Get all completed orders with ICCIDs, including provider info
      const activeOrders = await db.query.orders.findMany({
        where: and(
          eq(orders.status, "completed"),
          isNotNull(orders.iccid)
        ),
        limit: 100, // Process in batches
      });

      console.log(`🔄 Syncing usage for ${activeOrders.length} active eSIMs across multiple providers...`);

      // Group orders by provider for per-provider rate limiting
      const ordersByProvider = new Map<string, typeof activeOrders>();
      for (const order of activeOrders) {
        const providerKey = order.providerId || 'airalo-legacy';
        if (!ordersByProvider.has(providerKey)) {
          ordersByProvider.set(providerKey, []);
        }
        ordersByProvider.get(providerKey)!.push(order);
      }

      let successCount = 0;
      let failCount = 0;
      const providerCounts: Record<string, { success: number; failed: number }> = {};

      // Process each provider's orders with provider-specific rate limiting
      for (const [providerKey, providerOrders] of Array.from(ordersByProvider.entries())) {
        console.log(`   Processing ${providerOrders.length} orders for provider: ${providerKey}`);
        
        // Fetch provider config for rate limiting
        let delayMs = 1000; // Default: 1 request per second (60 req/min)
        try {
          if (providerKey !== 'airalo-legacy') {
            // Query provider directly from database
            const { providers } = await import("@shared/schema");
            const provider = await db.query.providers.findFirst({
              where: eq(providers.id, providerKey),
            });
            
            // Calculate delay based on provider's rate limit
            // Convert apiRateLimitPerHour to requests per minute, then calculate delay
            // If apiRateLimitPerHour is 3600 (60 req/min), delay should be 1000ms
            if (provider?.apiRateLimitPerHour && provider.apiRateLimitPerHour > 0) {
              const requestsPerMinute = provider.apiRateLimitPerHour / 60;
              delayMs = Math.ceil(60 * 1000 / requestsPerMinute);
            }
          }
        } catch (error) {
          console.warn(`   Could not fetch rate limit for ${providerKey}, using default 1000ms delay`);
        }

        console.log(`   Rate limit for ${providerKey}: ${delayMs}ms delay between requests`);

        // Initialize provider counts
        providerCounts[providerKey] = { success: 0, failed: 0 };

        // Process orders for this provider with rate limiting
        for (const order of providerOrders) {
          try {
            if (order.iccid) {
              await this.getDataUsage(order.iccid, order.providerId);
              successCount++;
              providerCounts[providerKey].success++;
            }
          } catch (error) {
            failCount++;
            providerCounts[providerKey].failed++;
            console.error(`   Failed to sync usage for order ${order.displayOrderId}:`, error);
          }
          
          // Respect provider-specific rate limit
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      console.log(`✅ Usage sync complete: ${successCount} success, ${failCount} failed`);
      console.log(`   Per-provider breakdown:`, providerCounts);
      return { successCount, failCount, total: activeOrders.length, providerCounts };
    } catch (error: any) {
      console.error("Failed to sync eSIM usage:", error.message);
      throw error;
    }
  }

  /**
   * Get comprehensive eSIM information with multi-language support
   */
  async getSimInfo(iccid: string, language: string = "en") {
    try {
      const response = await airaloAPI.getSimInfo(iccid, language);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch eSIM info for ${iccid}:`, error.message);
      throw new Error(`Failed to fetch eSIM info: ${error.message}`);
    }
  }

  /**
   * Get branded QR code for eSIM
   */
  async getBrandedQRCode(iccid: string, brandName?: string) {
    try {
      const params: any = {};
      if (brandName) {
        params.brand_settings_name = brandName;
      }
      
      const response = await airaloAPI.getBrandedQRCode(iccid, params);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch branded QR for ${iccid}:`, error.message);
      throw new Error(`Failed to fetch branded QR code: ${error.message}`);
    }
  }
}

export const esimService = new ESimService();
