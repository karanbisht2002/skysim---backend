import axios from "axios";

export async function verifyYookassa(body: any, gateway: any) {
  const paymentId = body?.paymentId || body?.yookassa?.paymentId;
  const orderId = body?.orderId || body?.yookassa?.orderId;

  if (!paymentId) {
    return {
      success: false,
      message: "YooKassa payment ID missing",
    };
  }

  if (!gateway?.secretKey || !gateway?.publicKey) {
    return {
      success: false,
      message: "YooKassa ShopID or Secret Key not configured",
    };
  }

  // Basic auth: Username is ShopID (gateway.publicKey), Password is Secret Key (gateway.secretKey)
  const auth = Buffer.from(`${gateway.publicKey}:${gateway.secretKey}`).toString("base64");

  try {
    const { data } = await axios.get(
      `https://api.yookassa.ru/v3/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (data.status !== "succeeded") {
      return {
        success: false,
        message: `YooKassa payment status is: ${data.status}`,
      };
    }

    return {
      success: true,
      provider: "yookassa",
      referenceId: orderId || data.metadata?.orderId || data.description,
      paymentId: data.id,
      amount: parseFloat(data.amount.value),
      currency: data.amount.currency,
      metadata: data.metadata || {},
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.description || error.message || "YooKassa verification failed",
    };
  }
}

export default verifyYookassa;
