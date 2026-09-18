import axios from "axios";
import crypto from "crypto";

export async function initYookassaPayment({
  shopId,
  secretKey,
  amount,
  currency,
  orderId,
  redirectUrl,
  metadata
}: {
  shopId: string;
  secretKey: string;
  amount: number;
  currency: string;
  orderId: string;
  redirectUrl: string;
  metadata?: any;
}) {
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const idempotenceKey = crypto.randomUUID();

  const payload = {
    amount: {
      value: amount.toFixed(2),
      currency: currency.toUpperCase()
    },
    capture: true,
    confirmation: {
      type: "redirect",
      return_url: redirectUrl
    },
    description: `Payment for order ${orderId}`,
    metadata: {
      orderId,
      ...metadata
    }
  };

  const res = await axios.post(
    "https://api.yookassa.ru/v3/payments",
    payload,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": idempotenceKey,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.data.confirmation || !res.data.confirmation.confirmation_url) {
    throw new Error("YooKassa payment initialization failed: No confirmation URL returned");
  }

  return {
    provider: "yookassa",
    authorizationUrl: res.data.confirmation.confirmation_url,
    reference: res.data.id,
  };
}

export default initYookassaPayment;
