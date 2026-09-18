import axios from "axios";

export async function initFlutterwavePayment({
  secretKey,
  email,
  amount,
  currency,
  orderId,
  name,
  phone,
  redirectUrl,
  metadata
}: {
  secretKey: string;
  email: string;
  amount: number;
  currency: string;
  orderId: string;
  name?: string;
  phone?: string;
  redirectUrl: string;
  metadata?: any;
}) {
  const payload = {
    tx_ref: orderId,
    amount: amount.toString(),
    currency: currency,
    redirect_url: redirectUrl,
    customer: {
      email,
      phonenumber: phone || "",
      name: name || "",
    },
    customizations: {
      title: "eSIM Connect",
      description: "Payment for order " + orderId,
    },
    meta: metadata
  };

  const res = await axios.post(
    "https://api.flutterwave.com/v3/payments",
    payload,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (res.data.status !== "success") {
    throw new Error(res.data.message || "Flutterwave payment initialization failed");
  }

  return {
    provider: "flutterwave",
    authorizationUrl: res.data.data.link,
    reference: orderId,
  };
}

export default initFlutterwavePayment;
