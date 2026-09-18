import axios from "axios";

export async function initMidtransPayment({
  serverKey,
  clientKey,
  merchantId,
  mode = "test",
  amount,
  currency,
  orderId,
  email,
  name,
  phone,
  packageId,
  quantity = 1,
  metadata,
}: {
  serverKey: string;
  clientKey?: string;
  merchantId?: string;
  mode?: string;
  amount: number;
  currency: string;
  orderId: string;
  email?: string;
  name?: string;
  phone?: string;
  packageId?: string;
  quantity?: number;
  metadata?: any;
}) {
  const isProduction = mode === "live";
  const baseUrl = isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";

  // Midtrans accepts gross_amount as integer (IDR) or rounded decimal depending on currency setup
  // By default, rounded integer is universally accepted by Midtrans Snap API
  const grossAmount = Math.round(amount);

  const authHeader = `Basic ${Buffer.from(`${serverKey.trim()}:`).toString("base64")}`;

  const payload: any = {
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount,
    },
    customer_details: {
      first_name: name || "Customer",
      email: email || "customer@example.com",
      phone: phone || "",
    },
    item_details: [
      {
        id: (packageId || "esim_package").toString().substring(0, 50),
        price: grossAmount,
        quantity: 1,
        name: (metadata?.packageTitle || packageId || "eSIM Package").toString().substring(0, 50),
      },
    ],
  };

  if (metadata) {
    try {
      payload.custom_field1 = JSON.stringify(metadata).substring(0, 255);
    } catch {
      // ignore
    }
  }

  try {
    const response = await axios.post(`${baseUrl}/snap/v1/transactions`, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader,
      },
    });

    if (!response.data || !response.data.token) {
      throw new Error(
        response.data?.error_messages?.join(", ") ||
          "Midtrans Snap transaction initialization failed"
      );
    }

    return {
      provider: "midtrans",
      token: response.data.token,
      redirectUrl: response.data.redirect_url,
      orderId,
    };
  } catch (err: any) {
    const errorDetails =
      err.response?.data?.error_messages?.join(", ") ||
      err.response?.data?.message ||
      err.message ||
      "Midtrans Snap transaction initialization failed";
    console.error("❌ Midtrans init error:", errorDetails, err.response?.data || "");
    throw new Error(`Midtrans Error: ${errorDetails}`);
  }
}

export default initMidtransPayment;
