"use strict";

import { makeEsimAccessRequest, formatDataAmount } from "./api";
import type {
  ProviderOrderRequest,
  ProviderOrderResponse,
  ProviderOrderStatus,
  ProviderUsageData,
  ProviderTopupPackage,
  ProviderTopupRequest,
  ProviderTopupResponse,
  ProviderRefundRequest,
  ProviderRefundResponse,
  ProviderCancelRequest,
  ProviderCancelResponse,
} from "../../providers/provider-interface";
import type {
  EsimAccessOrderResponse,
  EsimAccessQueryResponse,
  EsimAccessTopupListResponse,
  EsimAccessTopupResponse,
} from "./types";

export async function createEsimAccessOrder(
  request: ProviderOrderRequest,
  accessCode: string,
  secretKey: string
): Promise<ProviderOrderResponse> {
  try {
    const response = await makeEsimAccessRequest<any>(
      "/api/v1/open/esim/order",
      "POST",
      {
        transactionId: request.customerRef,
        packageInfoList: [
          {
            packageCode: request.packageId,
            count: request.quantity || 1,
          },
        ],
      },
      accessCode,
      secretKey
    );

    const orderNo = response?.obj?.orderNo;

    if (!orderNo) {
      throw new Error("Provider did not return orderNo");
    }

    // ===============================
    // STEP 2 – WAIT FOR ALLOCATION
    // ===============================

    const allocatedOrder = await waitForEsimAllocation(
      orderNo,
      accessCode,
      secretKey
    );

    console.log("Allocated order:", orderNo, allocatedOrder);

    return {
      success: true,
      providerOrderId: orderNo,
      requestId: orderNo,
      status: allocatedOrder.status === 'cancelled' ? 'failed' : allocatedOrder.status,
      processingTime: 5,

      iccid: allocatedOrder.iccid,
      qrCode: allocatedOrder.qrCode,
      smdpAddress: allocatedOrder.smdpAddress,
      activationCode: allocatedOrder.activationCode,
    };
  } catch (error) {
    return {
      success: false,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ===============================
// POLLING LOGIC (MOST IMPORTANT PART)
// ===============================

async function waitForEsimAllocation(
  orderNo: string,
  accessCode: string,
  secretKey: string,
  maxRetries = 12,
  delayMs = 3000
): Promise<ProviderOrderStatus> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const status = await getEsimAccessOrderStatus(
      orderNo,
      accessCode,
      secretKey
    );

    if (
      status.iccid &&
      ["completed", "active", "ready"].includes(status.status)
    ) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("eSIM allocation timeout");
}

export async function getEsimAccessOrderStatus(
  providerOrderId: string,
  accessCode: string,
  secretKey: string
): Promise<ProviderOrderStatus> {
  try {
    // console.log('Checking status for order:', providerOrderId);
    const response = await makeEsimAccessRequest<EsimAccessQueryResponse>(
      "/api/v1/open/esim/query",
      "POST",
      {
        orderNo: providerOrderId,
        pager: {
          pageNum: 1,
          pageSize: 10,
        },
      },
      accessCode,
      secretKey
    );

    console.log('Provider response for order', providerOrderId, ':', response);

    const obj = response.obj?.esimList?.[0] ?? response.obj;
    console.log('Order status:', obj);

    if (!obj) {
      return {
        providerOrderId,
        status: "failed",
        errorMessage: "Order not found in provider response",
      };
    }

    const status =
      obj.smdpStatus === "ALLOCATED"
        ? "completed"
        : obj.esimStatus === "CANCEL"
          ? "cancelled"
          : obj.smdpStatus === "RELEASED"
            ? "completed"
            : obj.smdpStatus === "PENDING"
              ? "processing"
              : obj.smdpStatus === "FAILED"
                ? "failed"
                : obj.smdpStatus === "IN_USE"
                  ? "completed"
                  : obj.smdpStatus === "ENABLED"
                    ? "completed"
                    : obj.smdpStatus === "DISABLED"
                      ? "completed"
                      : 'pending';

    const esimStatusMap = {
      CREATE: "pending",
      PAYING: "pending",
      PAID: "paid",

      GETTING_RESOURCE: "provisioning",
      GOT_RESOURCE: "ready",

      IN_USE: "active",

      USED_UP: "used_up",

      UNUSED_EXPIRED: "expired",
      USED_EXPIRED: "expired",

      SUSPENDED: "suspended",

      CANCEL: "cancelled",
      REVOKE: "revoked"
    } as const;

    // console.log('ESIM status:', obj.esimStatus, esimStatusMap[obj.esimStatus]);

    const esimStatus = esimStatusMap[obj.esimStatus] ?? "pending";

    // console.log('ESIM status:', esimStatus);


    return {
      providerOrderId: obj.orderNo,
      status,
      iccid: obj.iccid,

      // eSIM install
      qrCode: obj.qrCodeUrl,
      qrCodeUrl: obj.qrCodeUrl,

      activationCode: obj.ac,
      smdpAddress: obj.ac?.split("$")[1],
      esimStatus,

      // Plan info
      packageName: obj.packageList?.[0]?.packageName,
      country: obj.ipExport,
      expiryDate: obj.expiredTime,

      // Optional
      imsi: obj.imsi,
      apn: obj.apn,
    };

  } catch (error) {
    return {
      providerOrderId,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
}


export async function getEsimAccessUsageData(
  iccid: string,
  accessCode: string,
  secretKey: string
): Promise<ProviderUsageData> {
  try {
    const esimTranNoList = [iccid];

    const response = await makeEsimAccessRequest<EsimAccessQueryResponse>(
      '/api/v1/open/esim/usage/query',
      'POST',
      { esimTranNoList },
      accessCode,
      secretKey
    );

    const usage = response.obj?.esimUsageList?.[0];

    if (!usage) {
      throw new Error('No usage data returned from provider');
    }

    // Provider gives BYTES
    const BYTES_IN_MB = 1024 * 1024;

    const dataUsedMB = Math.round((usage.dataUsage ?? 0) / BYTES_IN_MB);
    const dataTotalMB = Math.round((usage.totalData ?? 0) / BYTES_IN_MB);
    const dataRemainingMB = Math.max(dataTotalMB - dataUsedMB, 0);

    const percentageUsed =
      dataTotalMB > 0 ? (dataUsedMB / dataTotalMB) * 100 : 0;

    return {
      iccid: usage.esimTranNo,
      dataUsed: dataUsedMB,       // MB
      dataTotal: dataTotalMB,     // MB
      dataRemaining: dataRemainingMB, // MB
      percentageUsed: Math.round(percentageUsed * 100) / 100,
      expiresAt: undefined, // not provided by API
      status: dataUsedMB < dataTotalMB ? 'active' : 'inactive',
    };
  } catch (error) {
    throw new Error(
      `Failed to get usage data: ${error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function getEsimAccessTopupPackages(
  iccidOrPackageId: string,
  accessCode: string,
  secretKey: string
): Promise<ProviderTopupPackage[]> {
  try {
    let queryParams: { iccid?: string; packageCode?: string; slug?: string } = {};

    if (iccidOrPackageId.length > 15) {
      queryParams.iccid = iccidOrPackageId;
    } else {
      queryParams.slug = iccidOrPackageId;
    }

    const response = await makeEsimAccessRequest<EsimAccessTopupListResponse>(
      '/api/v1/open/package/list',
      'POST',
      { type: 'TOPUP', ...queryParams },
      accessCode,
      secretKey
    );

    // console.log('Provider response for topup packages:',   JSON.stringify(response.obj.packageList, null, 2));

    return response.obj.packageList.map(pkg => ({
      providerPackageId: pkg.packageCode,
      title: pkg.name,
      dataAmount: formatDataAmount(pkg.volume),
      validity: pkg.duration,
      wholesalePrice: pkg.price / 10000,
      currency: pkg.currencyCode,
    }));
  } catch (error) {
    return [];
  }
}

export async function purchaseEsimAccessTopup(
  request: ProviderTopupRequest,
  accessCode: string,
  secretKey: string
): Promise<ProviderTopupResponse> {
  try {
    const response = await makeEsimAccessRequest<EsimAccessTopupResponse>(
      '/api/v1/open/esim/topup',
      'POST',
      {
        iccid: request.iccid,
        packageCode: request.packageId,
        quantity: request.quantity || 1,
        transactionId: request.transactionId,
      },
      accessCode,
      secretKey
    );

    return {
      success: true,
      providerTopupId: response.obj.orderNo,
      requestId: response.obj.orderNo,
      status: 'completed',
    };
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function cancelEsimAccessEsim(
  iccid: string,
  accessCode: string,
  secretKey: string
): Promise<ProviderCancelResponse> {
  try {
    const response = await makeEsimAccessRequest<{ success: boolean; message?: string }>(
      '/api/v1/open/esim/cancel',
      'POST',
      {
        iccid,
        action: "cancel",
      },
      accessCode,
      secretKey
    );

    return {
      success: true,
      status: "cancelled",
      message: response.message || "eSIM cancelled successfully",
    };
  } catch (error) {
    return {
      success: false,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Cancel request failed",
    };
  }
}
