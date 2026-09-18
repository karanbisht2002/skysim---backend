import React, { useState, useRef } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import StripeCheckoutForm from './StripeCheckoutForm';
import RazorpayPayment from './RazorpayPayment';
import PaypalPayment from './PaypalPayment';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PowerTranzCardForm from './Powertranzcardform';
import MidtransPayment from './MidtransPayment';

interface PaymentGatewayRendererProps {
  initData: {
    provider: 'stripe' | 'razorpay' | 'paypal' | 'powertranz' | 'paystack' | 'flutterwave' | 'yookassa' | 'midtrans';
    publicKey?: string;
    clientSecret?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
    guestAccessToken?: string;
    redirectData?: string;      // PowerTranz 3DS HTML
    redirectUrl?: string;       // Flutterwave / Paystack / Midtrans redirect
    spiToken?: string;          // PowerTranz token
    token?: string;             // Midtrans Snap token
    purchaseType?: string;
    mode?: string;
  };
  email?: string;
  name?: string;
  packageData?: any;            // For debugging
}

export default function PaymentGatewayRenderer({
  initData,
  email,
  name,
  packageData,
}: PaymentGatewayRendererProps) {
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [powertranzState, setPowertranzState] = useState<
    'card_form' | 'processing' | '3ds_challenge' | 'error'
  >('card_form');
  const [powertranzError, setPowertranzError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  console.log('🎯 PaymentGatewayRenderer initialized with:', {
    provider: initData.provider,
    hasClientSecret: !!initData.clientSecret,
    hasOrderId: !!initData.orderId,
    hasSpiToken: !!initData.spiToken,
    hasRedirectData: !!initData.redirectData,
  });

  // =============== STRIPE ===============
  if (initData.provider === 'stripe') {
    if (!initData.clientSecret || !initData.publicKey) {
      console.error('❌ Stripe data missing', initData);
      return (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Payment Setup Error</p>
                <p className="text-sm text-red-700 mt-1">
                  Stripe configuration (client secret or public key) is missing. Please contact support.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    let stripePublicKey = initData.publicKey
    const stripePromise = loadStripe(
      stripePublicKey
    );

    return (
      <Elements stripe={stripePromise} options={{ clientSecret: initData.clientSecret }}>
        <StripeCheckoutForm guestAccessToken={initData.guestAccessToken} purchaseType={initData?.purchaseType} />
      </Elements>
    );
  }

  // =============== RAZORPAY ===============
  if (initData.provider === 'razorpay') {
    if (!initData.orderId || !initData.amount || !initData.currency || !initData.publicKey) {
      console.error('❌ Razorpay data missing', initData);
      return (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Payment Setup Error</p>
                <p className="text-sm text-red-700 mt-1">
                  Required payment data is missing. Please try again.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <RazorpayPayment
        orderId={initData.orderId}
        amount={initData.amount}
        currency={initData.currency}
        publicKey={initData.publicKey}
        email={email}
        guestAccessToken={initData.guestAccessToken}
        purchaseType={initData.purchaseType}
      />
    );
  }

  // =============== PAYPAL ===============
  if (initData.provider === 'paypal') {
    if (!initData.orderId) {
      console.error('❌ PayPal orderId missing', initData);
      return (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Payment Setup Error</p>
                <p className="text-sm text-red-700 mt-1">
                  PayPal order ID is missing. Please try again.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <PaypalPayment
        orderId={initData.orderId}
        publicKey={initData.publicKey}
        mode={initData.mode || 'sandbox'}
        guestAccessToken={initData.guestAccessToken}
        purchaseType={initData.purchaseType}
        currency={initData.currency}
      />
    );
  }

  // =============== POWERTRANZ ===============
  if (initData.provider === 'powertranz') {
    console.log('🔥 PowerTranz flow:', {
      state: powertranzState,
      hasRedirectData: !!initData.redirectData,
      hasSpiToken: !!initData.spiToken,
    });

    // ✅ STATE 1: CARD FORM (User enters card details)
    if (powertranzState === 'card_form') {
      return (
        <PowerTranzCardForm
          onCardSubmit={async (cardData) => {
            console.log('✅ Card form submitted:', cardData);
            setPowertranzState('processing');
            setPowertranzError(null);

            try {
              // Re-initialize payment with card data
              // (This would be called from parent component instead)
              // For now, we'll just move to 3DS
              setPowertranzState('3ds_challenge');
            } catch (error: any) {
              console.error('❌ Card submission error:', error);
              setPowertranzError(error.message || 'Failed to process card');
              setPowertranzState('card_form');
            }
          }}
          isLoading={powertranzState === 'processing'}
          error={powertranzError || undefined}
          onCancel={() => {
            console.log('❌ User cancelled card form');
          }}
        />
      );
    }

    // ✅ STATE 2: PROCESSING
    if (powertranzState === 'processing') {
      return (
        <Card className="border-blue-200">
          <CardContent className="p-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-center">Processing your payment...</p>
            <p className="text-sm text-muted-foreground">
              Please wait while we initialize your 3D Secure authentication.
            </p>
          </CardContent>
        </Card>
      );
    }

    // ✅ STATE 3: 3DS CHALLENGE (PowerTranz 3D Secure challenge form)
    if (powertranzState === '3ds_challenge') {
      if (!initData.redirectData) {
        console.error('❌ PowerTranz redirectData missing!', initData);
        return (
          <Card className="border-red-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">3D Secure Error</p>
                  <p className="text-sm text-red-700 mt-1">
                    Failed to load 3D Secure challenge. Please try again.
                  </p>
                  <Button
                    onClick={() => {
                      setPowertranzState('card_form');
                      setPowertranzError(null);
                    }}
                    className="mt-3"
                    size="sm"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      }

      console.log('🔐 Rendering 3DS iframe...');

      return (
        <div className="w-full border rounded-md overflow-hidden shadow-lg">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 p-3 border-b">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              🔒 3D Secure Authentication
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Please complete the verification below to confirm your payment.
            </p>
          </div>

          <iframe
            ref={iframeRef}
            title="PowerTranz 3DS Authentication"
            srcDoc={initData.redirectData}
            style={{
              width: '100%',
              height: '600px',
              border: 'none',
              backgroundColor: '#fff',
            }}
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
            onLoad={() => {
              console.log('✅ 3DS iframe loaded');
            }}
          />

          <div className="bg-gray-50 dark:bg-gray-900/50 p-3 border-t text-xs text-muted-foreground">
            <p>
              💡 The form above is secure and encrypted. Do not refresh or close this page while
              authenticating.
            </p>
          </div>
        </div>
      );
    }

    // ✅ STATE 4: ERROR
    if (powertranzState === 'error') {
      return (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-900">Payment Error</p>
                <p className="text-sm text-red-700 mt-1">{powertranzError}</p>
                <Button
                  onClick={() => {
                    setPowertranzState('card_form');
                    setPowertranzError(null);
                  }}
                  className="mt-3"
                  size="sm"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
  }

  // =============== PAYSTACK ===============
  if (initData.provider === 'paystack') {
    if (!initData.redirectUrl) {
      console.error('❌ Paystack redirectUrl missing', initData);
      return (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Payment Setup Error</p>
                <p className="text-sm text-red-700 mt-1">
                  Paystack redirect URL is missing. Please try again.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4 text-center mt-6 mb-2">
        <p className="text-sm text-muted-foreground">
          You will be redirected to Paystack to complete your payment securely.
        </p>
        <Button
          className="w-full bg-[#09a5db] hover:bg-[#0785b1] text-white py-6 text-lg"
          onClick={() => window.location.href = initData.redirectUrl!}
        >
          Proceed to Paystack
        </Button>
      </div>
    );
  }

  // =============== FLUTTERWAVE ===============
  if (initData.provider === 'flutterwave') {
    if (!initData.redirectUrl) {
      console.error('❌ Flutterwave redirectUrl missing', initData);
      return (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Payment Setup Error</p>
                <p className="text-sm text-red-700 mt-1">
                  Flutterwave redirect URL is missing. Please try again.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4 text-center mt-6 mb-2">
        <p className="text-sm text-muted-foreground">
          You will be redirected to Flutterwave to complete your payment securely.
        </p>
        <Button
          className="w-full bg-[#f5a623] hover:bg-[#e09612] text-white py-6 text-lg"
          onClick={() => window.location.href = initData.redirectUrl!}
        >
          Proceed to Flutterwave
        </Button>
      </div>
    );
  }

  // =============== YOOKASSA ===============
  if (initData.provider === 'yookassa') {
    if (!initData.redirectUrl) {
      console.error('❌ YooKassa redirectUrl missing', initData);
      return (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Payment Setup Error</p>
                <p className="text-sm text-red-700 mt-1">
                  YooKassa redirect URL is missing. Please try again.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4 text-center mt-6 mb-2">
        <p className="text-sm text-muted-foreground">
          You will be redirected to YooKassa to complete your payment securely.
        </p>
        <Button
          className="w-full bg-[#008cf0] hover:bg-[#007cd7] text-white py-6 text-lg"
          onClick={() => window.location.href = initData.redirectUrl!}
        >
          Proceed to YooKassa
        </Button>
      </div>
    );
  }

  // =============== MIDTRANS ===============
  if (initData.provider === 'midtrans') {
    if (!initData.publicKey) {
      console.error('❌ Midtrans Client Key missing', initData);
      return (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Payment Setup Error</p>
                <p className="text-sm text-red-700 mt-1">
                  Midtrans Client Key is missing. Please contact support.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <MidtransPayment
        orderId={initData.orderId || ''}
        token={initData.token}
        redirectUrl={initData.redirectUrl}
        clientKey={initData.publicKey}
        mode={initData.mode || 'test'}
        email={email}
        guestAccessToken={initData.guestAccessToken}
        purchaseType={initData.purchaseType}
      />
    );
  }

  // =============== DEFAULT ===============
  console.error('❌ Unsupported payment provider:', initData.provider);
  return (
    <Card className="border-red-200">
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Unsupported Payment Provider</p>
            <p className="text-sm text-red-700 mt-1">
              The selected payment provider is not supported. Please select another payment method.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}