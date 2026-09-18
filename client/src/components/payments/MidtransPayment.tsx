import { useEffect, useState } from "react";
import { Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  orderId: string;
  token?: string;
  redirectUrl?: string;
  clientKey: string;
  mode?: string;
  email?: string;
  guestAccessToken?: string;
  purchaseType?: string;
}

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        options: {
          onSuccess?: (result: any) => void;
          onPending?: (result: any) => void;
          onError?: (result: any) => void;
          onClose?: () => void;
        }
      ) => void;
    };
  }
}

export default function MidtransPayment({
  orderId,
  token,
  redirectUrl,
  clientKey,
  mode = "test",
  email,
  guestAccessToken,
  purchaseType,
}: Props) {
  const [isScriptLoading, setIsScriptLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const isProduction = mode === "live";
  const snapScriptUrl = isProduction
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";

  useEffect(() => {
    const scriptId = "midtrans-snap-sdk";
    let existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

    // If script already exists but with a different environment or client key, remove it
    if (existingScript) {
      const currentSrc = existingScript.getAttribute("src");
      const currentKey = existingScript.getAttribute("data-client-key");
      if (currentSrc !== snapScriptUrl || currentKey !== clientKey.trim()) {
        existingScript.remove();
        delete (window as any).snap;
        existingScript = null;
      }
    }

    const handleScriptLoad = () => {
      if (!window.snap) {
        setError("Midtrans Snap SDK failed to load");
      }
      setIsScriptLoading(false);
    };

    if (existingScript) {
      if (window.snap) {
        setIsScriptLoading(false);
      } else {
        existingScript.onload = handleScriptLoad;
      }
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = snapScriptUrl;
    script.setAttribute("data-client-key", clientKey.trim());
    script.async = true;
    script.onload = handleScriptLoad;
    script.onerror = () => {
      setError("Failed to load Midtrans Snap SDK");
      setIsScriptLoading(false);
    };
    document.body.appendChild(script);
  }, [snapScriptUrl, clientKey]);

  const openSnapModal = () => {
    if (!token) {
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      setError("Midtrans Snap token is missing");
      return;
    }

    if (!window.snap) {
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      setError("Midtrans Snap SDK is not loaded yet");
      return;
    }

    setIsOpen(true);

    window.snap.pay(token, {
      onSuccess: (result: any) => {
        console.log("✅ Midtrans payment success:", result);
        const params = new URLSearchParams({
          providerType: "midtrans",
          orderId: result.order_id || orderId,
          transactionId: result.transaction_id || "",
          status_code: result.status_code || "200",
          transaction_status: result.transaction_status || "settlement",
        });

        if (purchaseType === "giftcard") {
          params.append("purchaseType", "giftcard");
        }

        if (guestAccessToken) {
          params.append("guestAccessToken", guestAccessToken);
        }

        window.location.href = `${window.location.origin}/order/processing?${params.toString()}`;
      },
      onPending: (result: any) => {
        console.log("⏳ Midtrans payment pending:", result);
        const params = new URLSearchParams({
          providerType: "midtrans",
          orderId: result.order_id || orderId,
          transactionId: result.transaction_id || "",
          status_code: result.status_code || "201",
          transaction_status: result.transaction_status || "pending",
        });

        if (purchaseType === "giftcard") {
          params.append("purchaseType", "giftcard");
        }

        if (guestAccessToken) {
          params.append("guestAccessToken", guestAccessToken);
        }

        window.location.href = `${window.location.origin}/order/processing?${params.toString()}`;
      },
      onError: (result: any) => {
        console.error("❌ Midtrans payment error:", result);
        setIsOpen(false);
        setError(result?.status_message || "Midtrans payment failed. Please try again.");
      },
      onClose: () => {
        console.log("Customer closed the Midtrans Snap modal without completing payment");
        setIsOpen(false);
      },
    });
  };

  // Auto-launch Snap popup once script is loaded and token is ready
  useEffect(() => {
    if (!isScriptLoading && window.snap && token && !isOpen && !error) {
      openSnapModal();
    }
  }, [isScriptLoading, token]);

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-900">Payment Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
          {redirectUrl && (
            <Button
              className="w-full bg-[#002855] hover:bg-[#001d3d] text-white gap-2"
              onClick={() => (window.location.href = redirectUrl)}
            >
              <ExternalLink className="w-4 h-4" />
              Pay via Midtrans Web Page
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 text-center mt-4 mb-2">
      <p className="text-sm text-muted-foreground">
        Click below to open the secure Midtrans payment window (GoPay, QRIS, Virtual Account, Card).
      </p>

      <Button
        className="w-full bg-[#002855] hover:bg-[#001d3d] text-white py-6 text-lg font-medium gap-2 shadow-md transition-all hover:scale-[1.01]"
        onClick={openSnapModal}
        disabled={isScriptLoading}
      >
        {isScriptLoading && <Loader2 className="w-5 h-5 animate-spin" />}
        Pay with Midtrans
      </Button>

      {redirectUrl && (
        <p className="text-xs text-muted-foreground">
          Popup didn&apos;t appear?{" "}
          <a
            href={redirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:opacity-80"
          >
            Click here to open payment page in a new tab
          </a>
        </p>
      )}
    </div>
  );
}
