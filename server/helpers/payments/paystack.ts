import axios from "axios";

export async function initPaystackPayment({
  secretKey,
  email,
  amount,
  currency,
  callbackUrl,
  metadata
}: {
  secretKey: string;
  email: string;
  amount: number;
  currency: string;
  callbackUrl?: string;
  metadata?: any;
}) {
  const res = await axios.post(
    "https://api.paystack.co/transaction/initialize",
    {
      email,
      amount: Math.round(amount * 100),
      currency,
      callback_url: callbackUrl,
      metadata: JSON.stringify(metadata)
    },
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    provider: "paystack",
    authorizationUrl: res.data.data.authorization_url,
    reference: res.data.data.reference,
  };
}
