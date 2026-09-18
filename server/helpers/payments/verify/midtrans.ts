import axios from "axios";
import crypto from "crypto";

/* ===============================
   VERIFY MIDTRANS PAYMENT
================================ */
export async function verifyMidtrans(body: any, gateway: any) {
  const midtransData = body?.midtrans || body;
  const orderId =
    midtransData?.orderId ||
    midtransData?.order_id ||
    body?.orderId ||
    body?.order_id;

  if (!orderId) {
    return {
      success: false,
      message: "Midtrans order ID missing",
    };
  }

  const serverKey = gateway?.secretKey?.trim();
  if (!serverKey) {
    return {
      success: false,
      message: "Midtrans Server Key not configured",
    };
  }

  const isProduction = gateway?.config?.mode === "live";
  const baseUrl = isProduction
    ? "https://api.midtrans.com/v2"
    : "https://api.sandbox.midtrans.com/v2";

  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;

  try {
    const { data: trx } = await axios.get(`${baseUrl}/${orderId}/status`, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
    });

    if (!trx || !trx.status_code) {
      return {
        success: false,
        message: "Midtrans status query returned empty response",
      };
    }

    // Validate signature_key if returned by Midtrans API
    if (trx.signature_key && trx.status_code && trx.gross_amount) {
      const payloadString = `${orderId}${trx.status_code}${trx.gross_amount}${serverKey}`;
      const expectedSignature = crypto
        .createHash("sha512")
        .update(payloadString)
        .digest("hex");

      if (trx.signature_key.toLowerCase() !== expectedSignature.toLowerCase()) {
        return {
          success: false,
          message: "Midtrans signature verification failed",
        };
      }
    }

    const transactionStatus = trx.transaction_status;
    const fraudStatus = trx.fraud_status;

    const isSuccessful =
      transactionStatus === "settlement" ||
      (transactionStatus === "capture" && fraudStatus === "accept");

    if (!isSuccessful) {
      return {
        success: false,
        message: `Midtrans payment not settled. Current status: ${transactionStatus}${
          fraudStatus ? ` (fraud: ${fraudStatus})` : ""
        }`,
      };
    }

    // Enrich metadata with existing order details if available
    let orderMeta: any = {};
    try {
      const { storage } = await import("server/storage");
      const order = await storage.getOrderById(orderId);
      if (order) {
        orderMeta = {
          type: order.userId ? "package_purchase" : "guest_purchase",
          orderId: order.id,
          existingOrderId: order.id,
          packageId: order.packageId,
          quantity: String(order.quantity || 1),
          userId: order.userId || "",
          guestEmail: order.guestEmail || "",
          guestPhone: order.guestPhone || "",
          guestAccessToken: order.guestAccessToken || "",
        };
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      provider: "midtrans",
      referenceId: trx.order_id || orderId,
      paymentId: trx.transaction_id || orderId,
      amount: parseFloat(trx.gross_amount),
      currency: trx.currency || "IDR",
      metadata: {
        orderId,
        existingOrderId: orderId,
        paymentType: trx.payment_type,
        transactionTime: trx.transaction_time,
        transactionStatus: trx.transaction_status,
        fraudStatus: trx.fraud_status,
        maskedCard: trx.masked_card,
        bank: trx.bank,
        ...orderMeta,
        ...(body?.metadata || {}),
      },
    };
  } catch (error: any) {
    const errorMsg =
      error?.response?.data?.status_message ||
      error?.response?.data?.message ||
      error.message ||
      "Midtrans verification failed";
    return {
      success: false,
      message: errorMsg,
    };
  }
}

export default verifyMidtrans;
