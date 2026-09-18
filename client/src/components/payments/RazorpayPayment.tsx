import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  orderId: string;
  amount: number;
  currency: string;
  publicKey: string;
  email: string;
  guestAccessToken?: string;
  purchaseType?: string;
}

export default function RazorpayPayment({
  orderId,
  amount,
  currency,
  publicKey,
  email,
  guestAccessToken,
  purchaseType
}: Props) {
  const [isScriptLoading, setIsScriptLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scriptId = "razorpay-js-sdk";
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement;

    const handleScriptLoad = () => {
      if (!(window as any).Razorpay) {
        setError("Razorpay SDK failed to load");
      }
      setIsScriptLoading(false);
    };

    if (existingScript) {
      if ((window as any).Razorpay) {
        setIsScriptLoading(false);
      } else {
        existingScript.onload = handleScriptLoad;
      }
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = handleScriptLoad;
    script.onerror = () => {
      setError("Failed to load Razorpay SDK");
      setIsScriptLoading(false);
    };
    document.body.appendChild(script);
  }, []);

  const openRazorpay = () => {
    if (!(window as any).Razorpay) {
      setError("Razorpay SDK is not loaded yet");
      return;
    }
    const options = {
      key: publicKey,
      amount,
      currency,
      order_id: orderId,
      name: "eSIM Connect",
      description: "Order Payment",
      prefill: { email },

      handler: async (response: any) => {
        console.log("✅ Razorpay success", response);

        const params = new URLSearchParams({
          providerType: "razorpay",
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
          redirect_status: "succeeded",
        });


         // ✅ add only for gift card
        if (purchaseType === "giftcard") {
          params.append("purchaseType", "giftcard");
        }


        // ✅ FIX 2 — only append for guest
        if (guestAccessToken) {
          params.append("guestAccessToken", guestAccessToken);
        }

        window.location.href =
          `${window.location.origin}/order/processing?${params.toString()}`;
      },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded-md bg-red-50 text-red-700 text-sm">
        {error}
      </div>
    );
  }

  return (
    <button 
      onClick={openRazorpay} 
      className="btn-primary w-full flex items-center justify-center gap-2"
      disabled={isScriptLoading}
    >
      {isScriptLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      Pay with Razorpay
    </button>
  );
}

