import { Airalo } from "airalo-sdk";
// @ts-ignore
import { Cached } from "airalo-sdk";
import axios from "axios";

const AIRALO_BASE_URL = "https://partners-api.airalo.com/v2";

class AiraloSDKWrapper {
  private sdk: Airalo | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  private get clientId(): string {
    return process.env.AIRALO_API_KEY || "";
  }

  private get clientSecret(): string {
    return process.env.AIRALO_API_SECRET || "";
  }

  private async ensureInitialized(): Promise<Airalo> {
    const isTokenExpired = this.tokenExpiry && Date.now() >= this.tokenExpiry;

    if (this.initialized && this.sdk && !isTokenExpired) {
      return this.sdk;
    }

    if (this.initPromise) {
      await this.initPromise;
      return this.sdk!;
    }

    this.initPromise = this.initialize();
    try {
      await this.initPromise;
      return this.sdk!;
    } finally {
      this.initPromise = null;
    }
  }

  private async initialize(): Promise<void> {
    try {
      // Proactively authenticate REST first to set correct tokenExpiry
      await this.authenticateREST();

      this.sdk = new Airalo({
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });
      await this.sdk.initialize();
      this.initialized = true;
      console.log("[Airalo SDK] Initialized successfully");
    } catch (error: any) {
      console.error("[Airalo SDK] Initialization failed:", error.message);
      throw new Error("Failed to initialize Airalo SDK");
    }
  }

  private async executeSDKCall<T>(call: (sdk: Airalo) => Promise<T>): Promise<T> {
    let sdk = await this.ensureInitialized();
    try {
      return await call(sdk);
    } catch (error: any) {
      const errorMessage = error.message || "";
      const is401 = errorMessage.includes("401") || 
                    (error.response && error.response.status === 401) ||
                    (error.response?.data?.meta?.message && error.response.data.meta.message.includes("Authentication failed"));
      
      if (is401) {
        console.warn("[Airalo SDK] 401 error detected. Clearing cache and retrying...");
        try {
          await Cached.clearCache();
        } catch (cacheErr) {
          console.error("[Airalo SDK] Failed to clear cache:", cacheErr);
        }
        
        this.accessToken = null;
        this.tokenExpiry = 0;
        this.initialized = false;
        
        sdk = await this.ensureInitialized();
        return await call(sdk);
      }
      
      throw error;
    }
  }

  async authenticate(): Promise<string> {
    return this.authenticateREST();
  }

  private async authenticateREST(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(`${AIRALO_BASE_URL}/token`, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
      });

      this.accessToken = response.data.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.data.expires_in * 1000) - 60000;

      return this.accessToken!;
    } catch (error: any) {
      console.error("[Airalo REST] Authentication failed:", error.response?.data || error.message);
      throw new Error("Failed to authenticate with Airalo API");
    }
  }

  private async restRequest(method: string, endpoint: string, params?: any): Promise<any> {
    let token = await this.authenticateREST();

    try {
      const response = await axios({
        method,
        url: `${AIRALO_BASE_URL}${endpoint}`,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: method === "GET" ? params : undefined,
        data: method !== "GET" ? params : undefined,
      });

      return response.data;
    } catch (error: any) {
      const is401 = error.response?.status === 401 ||
                    (error.response?.data?.meta?.message && error.response.data.meta.message.includes("Authentication failed"));
      
      if (is401) {
        console.warn("[Airalo REST] 401 error detected. Clearing cached token and retrying...");
        this.accessToken = null;
        this.tokenExpiry = 0;
        
        token = await this.authenticateREST();
        try {
          const response = await axios({
            method,
            url: `${AIRALO_BASE_URL}${endpoint}`,
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            params: method === "GET" ? params : undefined,
            data: method !== "GET" ? params : undefined,
          });
          return response.data;
        } catch (retryError: any) {
          const retryErrMsg = retryError.response?.data?.meta?.message ||
                              retryError.response?.data?.message ||
                              retryError.message ||
                              "Airalo API request failed after retry";
          console.error(`[Airalo REST] API retry error (${method} ${endpoint}):`, retryError.response?.data || retryError.message);
          throw new Error(retryErrMsg);
        }
      }
      
      const errMsg = error.response?.data?.meta?.message ||
                     error.response?.data?.message ||
                     error.message ||
                     "Airalo API request failed";
      console.error(`[Airalo REST] API error (${method} ${endpoint}):`, error.response?.data || error.message);
      throw new Error(errMsg);
    }
  }

  async getPackages(params?: {
    country?: string;
    type?: string;
    limit?: number;
    page?: number;
    include?: string;
    filter?: Record<string, any>;
    "filter[type]"?: string;
    "filter[country]"?: string;
  }): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      if (params?.country) {
        return await sdk.getCountryPackages(params.country, false, params?.limit || null);
      }
      return await sdk.getAllPackages(false, params?.limit || null, params?.page || null);
    });
  }

  async getAllPackagesFlat(): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getAllPackages(true);
    });
  }

  async getLocalPackages(flat: boolean = false): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getLocalPackages(flat);
    });
  }

  async getGlobalPackages(flat: boolean = false): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getGlobalPackages(flat);
    });
  }

  async getCountryPackages(countryCode: string, flat: boolean = false): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getCountryPackages(countryCode, flat);
    });
  }

  async getSimPackages(countryCode: string, flat: boolean = false): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getSimPackages(countryCode, flat);
    });
  }

  async getPackage(packageId: string): Promise<any> {
    return this.restRequest("GET", `/packages/${packageId}`);
  }

  async submitOrder(packageId: string, quantity: number = 1, description?: string): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.order(packageId, quantity, description || null);
    });
  }

  async submitOrderAsync(packageId: string, quantity: number = 1, webhookUrl?: string): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.orderAsync(packageId, quantity, webhookUrl || null);
    });
  }

  async orderWithEmailSimShare(packageId: string, quantity: number, esimCloud: {
    to_email: string;
    sharing_option: ('link' | 'pdf')[];
    copy_address?: string[];
  }, description?: string): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.orderWithEmailSimShare(packageId, quantity, esimCloud, description || null);
    });
  }

  async orderBulk(packages: Record<string, number>, description?: string): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.orderBulk(packages, description || null);
    });
  }

  async orderAsyncBulk(packages: Record<string, number>, webhookUrl?: string, description?: string): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.orderAsyncBulk(packages, webhookUrl || null, description || null);
    });
  }

  async getOrder(orderId: string): Promise<any> {
    return this.restRequest("GET", `/orders/${orderId}`);
  }

  async getOrdersList(params?: {
    include?: string;
    "filter[created_at]"?: string;
    "filter[code]"?: string;
    "filter[order_status]"?: string;
    "filter[iccid]"?: string;
    "filter[description]"?: string;
    limit?: number;
    page?: number;
  }): Promise<any> {
    return this.restRequest("GET", "/orders", params);
  }

  async submitTopup(iccid: string, packageId: string, description?: string): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.topup(packageId, iccid, description || null);
    });
  }

  async getTopupPackages(iccid: string): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getSimTopups(iccid);
    });
  }

  async getSimDetails(iccid: string): Promise<any> {
    return this.restRequest("GET", `/sims/${iccid}`);
  }

  async getSimInfo(iccid: string, language: string = "en"): Promise<any> {
    return this.restRequest("GET", `/sims/${iccid}`, { language });
  }

  async getUsage(iccid: string): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getSimUsage(iccid);
    });
  }

  async getUsageBulk(iccids: string[]): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.simUsageBulk(iccids);
    });
  }

  async getSimPackageHistory(iccid: string): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getSimPackageHistory(iccid);
    });
  }

  async getInstallationInstructions(iccid: string, params?: {
    language?: string;
    device?: string;
    model?: string;
  }): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getSimInstructions(iccid, params?.language || "en");
    });
  }

  async getCountries(): Promise<any> {
    return this.restRequest("GET", "/countries");
  }

  async getRegions(): Promise<any> {
    return this.restRequest("GET", "/regions");
  }

  async getDevices(): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getCompatibleDevices();
    });
  }

  async submitFutureOrder(
    packageId: string,
    quantity: number,
    dueDate: string,
    webhookUrl?: string,
    description?: string,
    brandSettingsName?: string,
    toEmail?: string,
    sharingOption?: ('link' | 'pdf')[],
    copyAddress?: string[]
  ): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.createFutureOrder(
        packageId,
        quantity,
        dueDate,
        webhookUrl || null,
        description || null,
        brandSettingsName || null,
        toEmail || null,
        sharingOption || null,
        copyAddress || null
      );
    });
  }

  async cancelFutureOrder(orderId: string): Promise<any> {
    return this.restRequest("DELETE", `/orders/future/${orderId}`);
  }

  async cancelFutureOrders(requestIds: string[]): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      console.log("requestIds", JSON.stringify(requestIds, null, 2));
      return await sdk.cancelFutureOrder(requestIds);
    });
  }

  async getSimsList(params?: {
    iccid?: string;
    "filter[order_id]"?: string;
    "filter[iccid]"?: string;
    "filter[created_at]"?: string;
    limit?: number;
    page?: number;
    include?: string;
  }): Promise<any> {
    return this.restRequest("GET", "/sims", params);
  }

  async updateSimBrand(iccid: string, brandName: string): Promise<any> {
    return this.restRequest("PUT", `/sims/${iccid}`, {
      brand_settings_name: brandName,
    });
  }

  async getBrandedQRCode(iccid: string, params?: {
    brand_name?: string;
    size?: number;
    brand_settings_name?: string;
  }): Promise<any> {
    return this.restRequest("GET", `/sims/${iccid}/qr`, params);
  }

  async requestRefund(params: {
    iccids: string[];
    reason: "SERVICE_ISSUES" | "OTHERS";
    notes?: string;
    email?: string;
  }): Promise<any> {
    return this.restRequest("POST", "/refund", params);
  }

  async getBalance(): Promise<any> {
    return this.restRequest("GET", "/balance");
  }

  async voucher(
    usageLimit: number,
    amount: number,
    quantity: number,
    isPaid: boolean = false,
    voucherCode?: string
  ): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.voucher(usageLimit, amount, quantity, isPaid, voucherCode || null);
    });
  }

  async esimVouchers(vouchers: { vouchers: { package_id: string; quantity: number }[] }): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.esimVouchers(vouchers);
    });
  }

  async getExchangeRates(
    date?: string,
    source?: string,
    from?: string,
    to?: string
  ): Promise<any> {
    return this.executeSDKCall(async (sdk) => {
      return await sdk.getExchangeRates(date || null, source || null, from || null, to || null);
    });
  }
}

export const airaloAPI = new AiraloSDKWrapper();
