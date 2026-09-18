import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import {
  ArrowLeft,
  Shield,
  Lock,
  CreditCard,
  Mail,
  Phone,
  Check,
  Loader2,
  Zap,
  Plus,
  Minus,
  Tag,
  Gift,
  Users,
  Coins,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { useCurrency } from '@/contexts/CurrencyContext';
import ReactCountryFlag from 'react-country-flag';
import { CoverageCountriesModal } from '@/components/CoverageCountriesModal';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CheckoutAuth } from '@/components/CheckoutAuth';
import PaymentGatewayRenderer from '@/components/payments/PaymentGatewayRenderer';
import { useSettingByKey } from '@/hooks/useSettings';
import { useTranslation } from '@/contexts/TranslationContext';

type UnifiedPackage = {
  id: string;
  slug: string;
  title: string;
  dataAmount: string;
  dataMb: number | null;
  validity: number;
  validityDays: number;
  price: string;
  retailPrice: string;
  currency: string;
  isUnlimited: boolean;
  providerId: string;
  providerName: string;
  destinationId: string | null;
  operator: string | null;
  countryCode: string | null;
  countryName: string | null;
};

type PackageDataApiRes = UnifiedPackage & {
  coverage: string[];
};

const formatDataAmount = (pkg: any): string => {
  if (!pkg) return 'eSIM';

  const dataMb = Number(pkg.dataMb);
  if (
    pkg.isUnlimited ||
    dataMb === -1 ||
    dataMb < 0 ||
    pkg.dataAmount === '-1MB' ||
    pkg.dataAmount?.includes('-1')
  ) {
    return 'Unlimited';
  }
  if (!isNaN(dataMb) && dataMb > 0) {
    if (dataMb >= 1024) {
      const gb = dataMb / 1024;
      if (gb === Math.floor(gb)) {
        return `${Math.floor(gb)}GB`;
      }
      return `${gb.toFixed(1)}GB`;
    }
    return `${dataMb}MB`;
  }
  if (pkg.dataAmount && !pkg.dataAmount.includes('-1')) {
    return pkg.dataAmount;
  }
  return 'Data';
};

const formatPackageTitle = (pkg: any): string => {
  const data = formatDataAmount(pkg);
  let validity = pkg.validity ?? pkg.validityDays ?? 0;
  const country = pkg.countryName || pkg.countryCode || '';

  if (validity === 0 && pkg.title) {
    const daysMatch = pkg.title.match(/(\d+)\s*Days?/i);
    if (daysMatch) {
      validity = parseInt(daysMatch[1], 10);
    }
  }

  if (country && data) {
    if (validity > 0) {
      return `${data} - ${validity} Days - ${country}`;
    }
    return `${data} - ${country}`;
  }
  if (pkg.title) {
    let formattedTitle = pkg.title
      .replace(/-1MB/g, 'Unlimited')
      .replace(/-1 MB/g, 'Unlimited')
      .replace(/-1mb/g, 'Unlimited');
    const parts = formattedTitle.match(/^(.+?)\s+(\d+(?:GB|MB)|Unlimited)\s+(\d+)\s*Days?$/i);
    if (parts) {
      return `${parts[2]} - ${parts[3]} Days - ${parts[1]}`;
    }
    return formattedTitle;
  }
  return `${data} eSIM`;
};

const checkoutSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(5, 'Please enter a valid phone number'),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and privacy policy',
  }),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

export default function UnifiedCheckout() {
  const { t } = useTranslation()
  const { packageSlug } = useParams();
  const [, setLocation] = useLocation();

  // Coverage Modal states
  const [isCoverageOpen, setIsCoverageOpen] = useState(false);
  const [coverageModalCountries, setCoverageModalCountries] = useState<string[]>([]);
  const [coverageModalTitle, setCoverageModalTitle] = useState('');

  const handleOpenCoverageModal = (countries: string[] | undefined, title: string) => {
    if (!countries || countries.length === 0) return;
    setCoverageModalCountries(countries);
    setCoverageModalTitle(title);
    setIsCoverageOpen(true);
  };
  const { toast } = useToast();
  const { currency, currencies } = useCurrency();
  const { user, isAuthenticated, isLoading: userLoading, refetchUser } = useUser();

  const [gateways, setGateways] = useState([]);
  const [selectedGateway, setSelectedGateway] = useState(null);
  const [initResponse, setInitResponse] = useState(null);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [quantity, setQuantity] = useState(1);

  // Promo states
  const [promoCode, setPromoCode] = useState('');
  const [promoCodeType, setPromoCodeType] = useState('voucher');
  const [isPromoOpen, setIsPromoOpen] = useState(true);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const siteName = useSettingByKey('platform_name');
  const [showPromo, setShowPromo] = useState(true);

  // Credits states
  const [appliedReferralCredits, setAppliedReferralCredits] = useState(0);
  const [isCreditsOpen, setIsCreditsOpen] = useState(false);

  const getCurrencySymbol = (currencyCode) =>
    currencies.find((c) => c.code === currencyCode)?.symbol || '$';

  // useEffect(() => {
  //   apiRequest('GET', '/api/payments/gateways')
  //     .then((res) => res.json())
  //     .then((data) => {
  //       setGateways(data.data || []);
  //       if (data.data?.length === 1) setSelectedGateway(data.data[0]);
  //     });
  // }, []);

  useEffect(() => {
    apiRequest('GET', `/api/payments/gateways?currency=${currency}`)
      .then((res) => res.json())
      .then((data) => {
        const fetchedGateways = data.data || [];
        setGateways(fetchedGateways);

        // Update selected gateway based on current currency support
        setSelectedGateway((prev: any) => {
          if (!prev) {
            const supported = fetchedGateways.filter((g: any) => g.isSupported !== false);
            return supported.length === 1 ? supported[0] : null;
          }
          const matched = fetchedGateways.find((g: any) => g.id === prev.id);
          if (!matched || matched.isSupported === false) {
            const supported = fetchedGateways.filter((g: any) => g.isSupported !== false);
            return supported.length === 1 ? supported[0] : null;
          }
          return matched;
        });

        // Reset initResponse on currency change to avoid stale transaction tokens
        setInitResponse(null);
      });
  }, [currency]);

  const { data: referralBalanceData } = useQuery({
    queryKey: ['/api/referrals/my-balance'],
    enabled: isAuthenticated,
  });

  const form = useForm({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      email: user?.email || '',
      phone: user?.phone || '',
      acceptTerms: false,
    },
  });

  const { data: packageData, isLoading: isLoadingPackage } = useQuery<PackageDataApiRes>({
    queryKey: [`/api/unified-packages/slug/${packageSlug}`, { currency }],
    enabled: !!packageSlug,
  });

  console.log('packageData', packageData?.coverage);

  // Get roundup threshold and target from settings
  const minOrderSetting = useSettingByKey('min_order_amount');
  const maxRoundupSetting = useSettingByKey('max_roundup_amount');

  const thresholdUSD = minOrderSetting ? parseFloat(minOrderSetting) : 0.50;
  const targetUSD = maxRoundupSetting ? parseFloat(maxRoundupSetting) : 0.70;

  const calculateTotal = () => {
    const basePrice = parseFloat(packageData?.retailPrice || packageData?.price || '0');
    const subtotal = basePrice * quantity;
    const totalDiscount = (appliedPromo?.discount || 0) + appliedReferralCredits;
    const finalTotal = subtotal - totalDiscount;

    // Get currency conversion rate
    const currentRate = parseFloat(currencies.find(c => c.code === currency)?.conversionRate || '1');
    const threshold = thresholdUSD * currentRate;
    const target = targetUSD * currentRate;

    let payableAmount = finalTotal <= 0 ? 0 : finalTotal;
    if (finalTotal > 0 && finalTotal < threshold) {
      payableAmount = Math.max(finalTotal, target);
    }

    return currency === 'IDR' ? Math.round(payableAmount).toString() : payableAmount.toFixed(2);
  };

  const availableCredits = referralBalanceData?.balance || 0;

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) {
      toast({
        title: t('app.checkout.enterCode', 'Enter a code'),
        description: t('app.checkout.enterCodeDescription', 'Please enter a promo code, gift card, or referral code'),
        variant: 'destructive',
      });
      return;
    }
    if (appliedPromo) {
      toast({
        title: t('app.checkout.codeAlreadyApplied', 'Code Already Applied'),
        description: t('app.checkout.removeCodeFirst', 'Remove the current code first to apply a different one'),
        variant: 'destructive',
      });
      return;
    }

    setIsValidatingPromo(true);
    try {
      const basePrice = parseFloat(packageData?.retailPrice || packageData?.price || '0');
      const orderAmount = basePrice * quantity;

      const res = await apiRequest('POST', '/api/validate-promo-code', {
        code: promoCode.trim(),
        type: promoCodeType,
        orderAmount,
      });

      const data = await res.json();

      if (!data.success) {
        toast({
          title: t('app.checkout.invalidCode', 'Invalid Code'),
          description: t('app.checkout.codeNotValid', 'This code is not valid'),
          variant: 'destructive',
        });
        return;
      }

      setAppliedPromo({
        code: data.code,
        discount: data.discount,
        type: data.type,
        voucherId: data.voucherId,
        giftCardId: data.giftCardId,
        referrerId: data.referrerId,
        balance: data.balance,
        description: data.description,
      });

      // toast({
      //   title: 'Code Applied',
      //   description: data.description || `Discount of $${data.discount.toFixed(2)} applied`,
      // });

      toast({
        title: t('app.checkout.codeApplied', 'Code Applied'),
        description:
          data.description ||
          (t('app.checkout.discountApplied', 'Discount of {amount} applied', { amount: `${getCurrencySymbol(packageData.currency)}${data.discount.toFixed(2)}` })),
      });

      setPromoCode('');
      setIsPromoOpen(false);
    } catch (error) {
      const extractErrorMessage = (error: any): string => {
        if (typeof error?.message !== 'string') return t('app.checkout.somethingWentWrong', 'Something went wrong');

        try {
          const json = error.message.slice(error.message.indexOf('{'));
          return JSON.parse(json).message;
        } catch {
          return error.message;
        }
      };
      toast({
        title: t('app.checkout.error', 'Error'),
        description: extractErrorMessage(error) || t('app.checkout.failedToValidate', 'Failed to validate code'),
        variant: 'destructive',
      });
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const removePromo = () => {
    setAppliedPromo(null);
    toast({ title: t('app.checkout.codeRemoved', 'Code Removed'), description: t('app.checkout.promoRemoved', 'Promo code has been removed') });
  };

  const handleApplyCredits = (amount) => {
    const basePrice = parseFloat(packageData?.retailPrice || packageData?.price || '0');
    const subtotal = basePrice * quantity;
    const promoDiscount = appliedPromo?.discount || 0;
    const maxCredits = Math.min(amount, subtotal - promoDiscount, availableCredits);

    if (maxCredits <= 0) {
      toast({
        title: t('app.checkout.cannotApplyCredits', 'Cannot apply credits'),
        description: t('app.checkout.creditsExceedTotal', 'Credits cannot exceed the order total'),
        variant: 'destructive',
      });
      return;
    }

    setAppliedReferralCredits(Math.round(maxCredits * 100) / 100);
    toast({
      title: t('app.checkout.creditsAppliedToast', 'Credits Applied'),
      description: t('app.checkout.creditsAppliedDesc', '{amount} in referral credits applied to your order', { amount: `$${maxCredits.toFixed(2)}` }),
    });
  };

  const removeCredits = () => {
    setAppliedReferralCredits(0);
    toast({
      title: t('app.checkout.creditsRemoved', 'Credits Removed'),
      description: t('app.checkout.creditsRemovedDesc', 'Referral credits have been removed from your order'),
    });
  };
  const totalAmount = Number(calculateTotal());
  const isFreeOrder = totalAmount === 0;

  const onSubmit = async (data) => {
    // If it's a paid order but no gateway is selected
    if (!isFreeOrder && !selectedGateway) {
      toast({
        title: t('app.checkout.selectPayment', 'Select payment method'),
        description: t('app.checkout.chooseGateway', 'Please choose a payment gateway'),
        variant: 'destructive',
      });
      return;
    }

    if (!isFreeOrder && selectedGateway?.isSupported === false) {
      toast({
        title: t('app.checkout.gatewayUnsupported', 'Payment Method Unavailable'),
        description: t('app.checkout.gatewayUnsupportedDesc', `${selectedGateway.displayName || selectedGateway.provider} does not support ${currency}. Please select another payment method.`),
        variant: 'destructive',
      });
      return;
    }

    setCustomerInfo(data);

    const payload = {
      gatewayId: selectedGateway?.id || 'free_gateway', // Optional if free
      packageId: packageData.id,
      quantity,
      currency: currency || packageData.currency || 'USD',
      orderId: `ORDER_${Date.now()}`,

      // Promo
      promoCode: appliedPromo?.code || null,
      promoType: appliedPromo?.type || null,
      voucherId: appliedPromo?.voucherId || null,
      giftCardId: appliedPromo?.giftCardId || null,

      // Referral
      referralCredits: appliedReferralCredits || 0,

      // Guest info
      email: data.email,
      name: data.name || t('app.checkout.guest', 'Guest'),
    };

    apiRequest('POST', '/api/payments/init', payload)
      .then((res) => res.json())
      .then((resData) => {
        if (!resData.success) {
          toast({
            title: t('app.checkout.paymentInitFailed', 'Payment Init Failed'),
            description: resData.message,
            variant: 'destructive',
          });
          return;
        }

        if (resData.builtInComplete) {
          const confirmUrl = user?.id ? '/api/confirm-payment' : '/api/guest/confirm-payment';
          toast({ title: t('app.checkout.processing', 'Processing'), description: t('app.checkout.finalizingFreeOrder', 'Finalizing free order...') });
          return apiRequest('POST', confirmUrl, {
            providerType: 'free',
            orderId: resData.payment.orderId,
            metadata: {
              packageId: packageData.id,
              quantity: String(quantity),
              guestAccessToken: resData.payment.guestAccessToken,
              guestEmail: data.email,
              guestPhone: data.phone || '',
              promoCode: appliedPromo?.code || '',
              promoType: appliedPromo?.type || '',
              promoDiscount: String((appliedPromo?.discount || 0) + (appliedReferralCredits || 0)),
              voucherId: appliedPromo?.voucherId || '',
              giftCardId: appliedPromo?.giftCardId || '',
              referralCredits: String(appliedReferralCredits || 0),
              type: user?.id ? "package_purchase" : "guest_purchase",
              userId: user?.id || '',
              email: data.email,
              currency: currency || packageData.currency || 'USD',
              existingOrderId: resData.payment.orderId,
            }
          })
            .then((r) => r.json())
            .then((confirmRes) => {
              if (confirmRes.success) {
                toast({
                  title: t('app.checkout.orderConfirmed', 'Order Confirmed'),
                  description: t('app.checkout.orderConfirmedDesc', 'Your eSIM has been activated successfully'),
                });
                setLocation(`/account/orders`);
              } else {
                toast({ title: t('app.checkout.orderFailed', 'Order Failed'), description: confirmRes.message, variant: 'destructive' });
              }
            });
        }

        if (selectedGateway?.provider === 'powertranz') {
          console.log('PowerTranz init response:', {
            redirectData: resData.powertranz?.redirectData,
            spiToken: resData.powertranz?.spiToken,
          });
          setInitResponse({
            provider: 'powertranz',
            orderId: resData.powertranz.orderId,
            redirectData: resData.powertranz.redirectData,
            spiToken: resData.powertranz.spiToken,
          });
          return;
        }

        setInitResponse(resData.payment);
      })
      .catch((err) => {
        toast({
          title: t('app.checkout.paymentInitError', 'Payment Init Error'),
          description: err.message || t('app.checkout.initApiFailed', 'Failed to call payment init API'),
          variant: 'destructive',
        });
      });
  };

  // 3DS postMessage handling is done by PaymentGatewayRenderer component
  // which calls /api/payments/powertranz/confirm with proper credentials

  const onSubmitOLD = (data) => {
    if (!selectedGateway) {
      toast({
        title: t('app.checkout.selectPayment', 'Select payment method'),
        description: t('app.checkout.chooseGateway', 'Please choose a payment gateway'),
        variant: 'destructive',
      });
      return;
    }

    setCustomerInfo(data);

    const payload = {
      gatewayId: selectedGateway.id,

      // 🔑 Pricing inputs (NOT amount)
      packageId: packageData.id,
      quantity,
      currency: currency || packageData.currency || 'USD',
      orderId: `ORDER_${Date.now()}`,

      // Promo
      promoCode: appliedPromo?.code || null,
      promoType: appliedPromo?.type || null,
      voucherId: appliedPromo?.voucherId || null,
      giftCardId: appliedPromo?.giftCardId || null,

      // Referral
      referralCredits: appliedReferralCredits || 0,

      // Guest info
      email: data.email,
      name: data.name || t('app.checkout.guest', 'Guest'),
    };

    apiRequest('POST', '/api/payments/init', payload)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          setShowPromo(false);
          setInitResponse(resData.payment);
          toast({ title: t('app.checkout.paymentInitialized', 'Payment Initialized'), description: t('app.checkout.paymentInitDesc', 'You can now complete your payment') });
        } else {
          toast({
            title: t('app.checkout.paymentInitFailed', 'Payment Init Failed'),
            description: resData.message || t('app.checkout.couldNotInit', 'Could not initialize payment'),
            variant: 'destructive',
          });
        }
      })
      .catch((err) => {
        toast({
          title: t('app.checkout.paymentInitError', 'Payment Init Error'),
          description: err.message || t('app.checkout.initApiFailed', 'Failed to call payment init API'),
          variant: 'destructive',
        });
      });
  };

  if (isLoadingPackage) {
    return (
      <div className="min-h-screen bg-background flex flex-col dark:text-white">
        {/* <SiteHeader /> */}
        <div className="flex-1 flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">{t('app.checkout.loading', 'Loading...')}</p>
          </div>
        </div>
        {/* <SiteFooter /> */}
      </div>
    );
  }

  if (!packageData) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* <SiteHeader /> */}
        <div className="flex-1 flex items-center justify-center pt-20">
          <div className="text-center">
            <p className="text-muted-foreground">{t('app.checkout.packageNotFound', 'Package not found')}</p>
            <Button onClick={() => setLocation('/')} className="mt-4">
              {t('app.checkout.goHome', 'Go Home')}
            </Button>
          </div>
        </div>
        {/* <SiteFooter /> */}
      </div>
    );
  }

  const unitPrice = parseFloat(packageData.retailPrice || packageData.price || '0');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>{t('app.checkout.pageTitle', 'Checkout - {data} eSIM | {site}', { data: formatDataAmount(packageData), site: siteName || '' })}</title>
      </Helmet>
      {/* <SiteHeader /> */}

      <main className="flex-1 pt-20 pb-12">
        <div className="container mx-auto px-4 max-w-7xl">
          <Button variant="ghost" onClick={() => window.history.back()} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" /> {t('app.checkout.back', 'Back')}
          </Button>

          <div
            className="grid
  grid-cols-1
  lg:grid-cols-5
  gap-6 lg:gap-8"
          >
            <div className="lg:col-span-3 space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground mb-2">{t('app.checkout.title', 'Checkout')}</h1>
                <p className="text-muted-foreground">
                  {t('app.checkout.description', 'Complete your purchase to get instant access to your eSIM')}
                </p>
              </div>

              {showPromo && isAuthenticated && (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <Collapsible open={isPromoOpen} onOpenChange={setIsPromoOpen}>
                      <CollapsibleTrigger className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">
                            {t('app.checkout.promoPrompt', 'Have promo, giftcard or referral?')}
                          </span>
                        </div>
                        <Plus
                          className={`w-4 h-4 transition-transform ${isPromoOpen ? 'rotate-45' : ''}`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4 space-y-4">
                        {!appliedPromo && (
                          <>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                type="button"
                                variant={promoCodeType === 'voucher' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setPromoCodeType('voucher')}
                              >
                                <Tag className="w-3 h-3 mr-1" />
                                {t('app.checkout.voucher', 'Voucher')}
                              </Button>
                              <Button
                                type="button"
                                variant={promoCodeType === 'giftcard' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setPromoCodeType('giftcard')}
                              >
                                <Gift className="w-3 h-3 mr-1" />
                                {t('app.checkout.giftCard', 'Gift Card')}
                              </Button>
                              <Button
                                type="button"
                                variant={promoCodeType === 'referral' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setPromoCodeType('referral')}
                              >
                                <Users className="w-3 h-3 mr-1" />
                                {t('app.checkout.referral', 'Referral')}
                              </Button>
                            </div>

                            <div className="flex gap-2">
                              <Input
                                placeholder={t('app.checkout.promoPlaceholder', 'Enter {type} code', { type: promoCodeType === 'voucher' ? t('app.checkout.voucher', 'voucher') : promoCodeType === 'giftcard' ? t('app.checkout.giftCard', 'gift card') : t('app.checkout.referral', 'referral') })}
                                value={promoCode}
                                onChange={(e) => setPromoCode(e.target.value)}
                              />
                              <Button
                                type="button"
                                onClick={handleApplyPromo}
                                variant="outline"
                                disabled={isValidatingPromo}
                              >
                                {isValidatingPromo ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  t('app.checkout.apply', 'Apply')
                                )}
                              </Button>
                            </div>
                          </>
                        )}

                        {appliedPromo && (
                          <>
                            <p className="text-xs text-muted-foreground">
                              {t('app.checkout.oneCodeOnly', 'Only one code can be applied per order. Remove the current code to apply a different one.')}
                            </p>
                            <div className="flex items-center justify-between bg-green-50 dark:bg-green-500/10 p-3 rounded-lg">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <Check className="w-4 h-4 text-green-600" />
                                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                    {appliedPromo.type === 'voucher'
                                      ? t('app.checkout.voucher', 'Voucher')
                                      : appliedPromo.type === 'giftcard'
                                        ? t('app.checkout.giftCard', 'Gift Card')
                                        : t('app.checkout.referral', 'Referral')}
                                    : {appliedPromo.code}
                                  </span>
                                </div>
                                {/* <span className="text-xs text-green-600 dark:text-green-500 ml-6">
                                  {appliedPromo.type === 'giftcard' && appliedPromo.balance
                                    ? `$${appliedPromo.discount.toFixed(2)} applied (Balance: $${appliedPromo.balance.toFixed(2)})`
                                    : appliedPromo.discount > 0
                                      ? `-$${appliedPromo.discount.toFixed(2)} discount`
                                      : appliedPromo.description || 'Discount applied'}
                                </span> */}

                                <span className="text-xs text-green-600 dark:text-green-500 ml-6">
                                  {appliedPromo.type === 'giftcard' && appliedPromo.balance ? (
                                    <>
                                      {getCurrencySymbol(packageData.currency)}
                                      {appliedPromo.discount.toFixed(2)} applied (Balance:
                                      {getCurrencySymbol(packageData.currency)}
                                      {appliedPromo.balance.toFixed(2)})
                                    </>
                                  ) : appliedPromo.discount > 0 ? (
                                    <>
                                      -{getCurrencySymbol(packageData.currency)}
                                      {appliedPromo.discount.toFixed(2)} discount
                                    </>
                                  ) : (
                                    appliedPromo.description || 'Discount applied'
                                  )}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={removePromo}
                                className="text-red-500 hover:text-red-600"
                              >
                                {t('app.checkout.remove', 'Remove')}
                              </Button>
                            </div>
                          </>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              )}

              {/* REFERRAL CREDITS - Only for authenticated users */}
              {isAuthenticated && availableCredits > 0 && (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <Collapsible open={isCreditsOpen} onOpenChange={setIsCreditsOpen}>
                      <CollapsibleTrigger className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-amber-500" />
                          <span className="font-medium text-foreground">{t('app.checkout.useReferralCredits', 'Use Referral Credits')}</span>
                          <span className="text-sm text-muted-foreground">
                            {t('app.checkout.creditsAvailable', '({amount} available)', { amount: `$${availableCredits.toFixed(2)}` })}
                          </span>
                        </div>
                        <Plus
                          className={`w-4 h-4 transition-transform ${isCreditsOpen ? 'rotate-45' : ''}`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4 space-y-4">
                        <p className="text-sm text-muted-foreground">
                          {t('app.checkout.creditsDescription', 'You have referral credits that can be used as a discount on this order.')}
                        </p>

                        {appliedReferralCredits > 0 ? (
                          <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-500/10 p-3 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-amber-600" />
                              <span className="text-sm text-amber-700 dark:text-amber-400">
                                {t('app.checkout.creditsApplied', '{amount} credits applied', { amount: `$${appliedReferralCredits.toFixed(2)}` })}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={removeCredits}
                              className="text-red-500 hover:text-red-600"
                            >
                              {t('app.checkout.remove', 'Remove')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleApplyCredits(availableCredits)}
                            >
                              {t('app.checkout.applyAll', 'Apply All ({amount})', { amount: `$${availableCredits.toFixed(2)}` })}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const basePrice = parseFloat(
                                  packageData?.retailPrice || packageData?.price || '0',
                                );
                                const subtotal = basePrice * quantity;
                                const halfCredits = Math.min(availableCredits / 2, subtotal);
                                handleApplyCredits(halfCredits);
                              }}
                            >
                              {t('app.checkout.applyHalf', 'Apply Half ({amount})', { amount: `$${Math.min(availableCredits / 2, parseFloat(calculateTotal())).toFixed(2)}` })}
                            </Button>
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              )}

              {/* CONTACT FORM - Only show for guest users */}
              {!isAuthenticated && !initResponse && (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-foreground mb-4">{t('app.checkout.contactInfo', 'Contact Information')}</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {t('app.checkout.contactDescription', "We'll send your eSIM details to this email. No account required.")}
                    </p>

                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('app.checkout.emailAddress', 'Email Address')}</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                      {...field}
                                      type="email"
                                      placeholder={t('app.checkout.emailPlaceholder', 'your@email.com')}
                                      className="pl-10"
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('app.checkout.phoneNumber', 'Phone Number')}</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                      {...field}
                                      type="tel"
                                      inputMode="numeric"
                                      maxLength={12}
                                      placeholder={t('app.checkout.phonePlaceholder', '1234567890')}
                                      className="pl-10"
                                      onChange={(e) => {
                                        const value = e.target.value.replace(/\D/g, '');
                                        field.onChange(value);
                                      }}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="acceptTerms"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border p-4 bg-muted/30">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel className="text-sm font-normal cursor-pointer">
                                  {t('app.checkout.agreeTerms', 'I agree to the')}{' '}
                                  <Link href="/terms" className="text-primary hover:underline">
                                    {t('app.checkout.termsOfService', 'Terms of Service')}
                                  </Link>{' '}
                                  {t('app.checkout.and', 'and')}{' '}
                                  <Link href="/privacy" className="text-primary hover:underline">
                                    {t('app.checkout.privacyPolicy', 'Privacy Policy')}
                                  </Link>
                                </FormLabel>
                                <FormMessage />
                              </div>
                            </FormItem>
                          )}
                        />

                        {/* PAYMENT GATEWAY SELECTION */}
                        {/* {gateways.length > 0 && (
                          <div className="space-y-4">
                            <h3 className="font-semibold text-foreground">Select Payment Method</h3>
                            <div className="flex flex-col md:flex-row gap-3 justify-center">
                              {gateways.map((gateway) => (
                                <Button
                                  key={gateway.id}
                                  type="button"
                                  variant={selectedGateway?.id === gateway.id ? '' : 'outline'}
                                  className="w-fit justify-start"
                                  onClick={() => setSelectedGateway(gateway)}
                                >
                                  {gateway.provider.toUpperCase()}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )} */}

                        {!isFreeOrder && gateways.length > 0 && (
                          <div className="flex flex-col sm:flex-row gap-3">
                            {gateways.map((gateway: any) => {
                              const isSupported = gateway.isSupported !== false;
                              const isSelected = selectedGateway?.id === gateway.id;

                              return (
                                <Button
                                  key={gateway.id}
                                  type="button"
                                  disabled={!isSupported}
                                  variant={isSelected ? 'default' : 'outline'}
                                  className={`
                                    w-full sm:w-auto
                                    px-6 py-3
                                    rounded-lg
                                    justify-center
                                    text-sm font-medium
                                    transition-all
                                    ${!isSupported ? 'opacity-50 cursor-not-allowed bg-muted/60 text-muted-foreground border-dashed hover:bg-muted/60 pointer-events-none' : ''}
                                  `}
                                  onClick={() => {
                                    if (isSupported) {
                                      setSelectedGateway(gateway);
                                    }
                                  }}
                                  title={!isSupported ? `Not supported in ${currency}` : undefined}
                                >
                                  <div className="flex flex-col items-center sm:items-start text-left">
                                    <span>{gateway.displayName || gateway.provider.toUpperCase()}</span>
                                    {!isSupported && (
                                      <span className="text-[10px] text-destructive font-normal">
                                        Not supported in {currency}
                                      </span>
                                    )}
                                  </div>
                                </Button>
                              );
                            })}
                          </div>
                        )}

                        <Button type="submit" className="w-full bg-primary text-white">
                          {t('app.checkout.continueToPayment', 'Continue to Payment')}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              )}

              {/* PAYMENT UI - For logged in users or after guest submits */}
              {(isAuthenticated || initResponse) && (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-foreground mb-4">{t('app.checkout.payment', 'Payment')}</h3>

                    {!initResponse ? (
                      <div className="space-y-4">
                        {/* PAYMENT GATEWAY SELECTION */}
                        {/* {gateways.length > 0 && (
                          <>
                            <h3 className="font-semibold text-foreground">Select Payment Method</h3>
                            {gateways.map((gateway) => (
                              <Button
                                key={gateway.id}
                                type="button"
                                variant={selectedGateway?.id === gateway.id ? 'default' : 'outline'}
                                className="w-full
sm:w-auto
justify-start"
                                onClick={() => setSelectedGateway(gateway)}
                              >
                                {gateway.provider.toUpperCase()}
                              </Button>
                            ))}
                          </>
                        )} */}

                        {!isFreeOrder && gateways.length > 0 && (
                          <>
                            <h3 className="font-semibold text-foreground">{t('app.checkout.selectPaymentMethod', 'Select Payment Method')}</h3>
                            <div className="flex flex-col sm:flex-row gap-3">
                              {gateways.map((gateway: any) => {
                                const isSupported = gateway.isSupported !== false;
                                const isSelected = selectedGateway?.id === gateway.id;

                                return (
                                  <Button
                                    key={gateway.id}
                                    type="button"
                                    disabled={!isSupported}
                                    variant={isSelected ? 'default' : 'outline'}
                                    className={`
                                      w-full sm:w-auto
                                      px-6 py-3
                                      rounded-lg
                                      justify-center
                                      text-sm font-medium
                                      transition-all
                                      ${!isSupported ? 'opacity-50 cursor-not-allowed bg-muted/60 text-muted-foreground border-dashed hover:bg-muted/60 pointer-events-none' : ''}
                                    `}
                                    onClick={() => {
                                      if (isSupported) {
                                        setSelectedGateway(gateway);
                                      }
                                    }}
                                    title={!isSupported ? `Not supported in ${currency}` : undefined}
                                  >
                                    <div className="flex flex-col items-center sm:items-start text-left">
                                      <span>{gateway.displayName || gateway.provider.toUpperCase()}</span>
                                      {!isSupported && (
                                        <span className="text-[10px] text-destructive font-normal">
                                          Not supported in {currency}
                                        </span>
                                      )}
                                    </div>
                                  </Button>
                                );
                              })}
                            </div>

                          </>
                        )}

                        {/* <Button
                          onClick={() =>
                            onSubmit({
                              email: user?.email || customerInfo?.email,
                              phone: user?.phone || customerInfo?.phone,
                              acceptTerms: true,
                            })
                          }
                          className="w-full bg-primary text-white"
                        >
                          Complete Payment
                        </Button> */}

                        <Button
                          onClick={() =>
                            onSubmit({
                              email: user?.email || customerInfo?.email,
                              phone: user?.phone || customerInfo?.phone,
                              acceptTerms: true,
                            })
                          }
                          className="w-full bg-primary text-white"
                        >
                          {isFreeOrder ? t('app.checkout.confirmOrder', 'Confirm Order') : t('app.checkout.completePayment', 'Complete Payment')}
                        </Button>
                      </div>
                    ) : (
                      <PaymentGatewayRenderer
                        initData={initResponse}
                        email={customerInfo?.email || user?.email}
                      />
                    )}
                  </CardContent>
                </Card>
              )}

              {/* PROMO CODE SECTION - Available for all users */}

              <div className="flex items-center gap-4 justify-center text-sm text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1">
                  <Shield className="w-4 h-4" />
                  <span>{t('app.checkout.secureCheckout', 'Secure Checkout')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="w-4 h-4" />
                  <span>{t('app.checkout.instantDelivery', 'Instant Delivery')}</span>
                </div>
              </div>
            </div>

            {/* ORDER SUMMARY */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24">
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-foreground mb-4">{t('app.checkout.orderSummary', 'Order Summary')}</h3>

                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
                      {packageData.countryCode && (
                        <div className="w-10 h-8 rounded overflow-hidden border border-border flex-shrink-0">
                          <ReactCountryFlag
                            countryCode={packageData.countryCode}
                            svg
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      )}

                      <div>
                        <p className="font-medium text-foreground">
                          {formatPackageTitle(packageData)}
                        </p>
                        <p className="text-sm text-muted-foreground">{t('app.checkout.esimDataPlan', 'eSIM Data Plan')}</p>
                      </div>
                    </div>

                    <div className="space-y-3 mb-4 pb-4 border-b border-border">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('app.checkout.data', 'Data')}</span>
                        <span className="font-medium text-foreground">
                          {formatDataAmount(packageData)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('app.checkout.validity', 'Validity')}</span>
                        <span className="font-medium text-foreground">
                          {packageData.validity} {t('app.checkout.days', 'Days')}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground block mb-1">{t('app.checkout.coverage', 'Coverage')}</span>
                        {packageData.coverage && packageData.coverage.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenCoverageModal(packageData.coverage, packageData.title)}
                            className="flex items-center gap-1.5 text-primary hover:text-primary-dark font-semibold transition-colors cursor-pointer text-sm py-1"
                          >
                            <Globe className="w-4 h-4" />
                            <span>{packageData.coverage.length} {t('app.checkout.countries', 'Countries')}</span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>

                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">{t('app.checkout.quantity', 'Quantity')}</span>
                        <div className="flex items-center gap-2">
                          {/* <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          disabled={quantity <= 1}
                        >
                          <Minus className="w-3 h-3" />
                        </Button> */}
                          <span className="font-medium text-foreground w-8 text-center">
                            {quantity}
                          </span>
                          {/* <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => setQuantity(Math.min(10, quantity + 1))}
                          disabled={quantity >= 10}
                        >
                          <Plus className="w-3 h-3" />
                        </Button> */}
                        </div>
                      </div>
                    </div>

                    {quantity > 1 && (
                      <div className="space-y-2 mb-4 pb-4 border-b border-border">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('app.checkout.pricePerEsim', 'Price per eSIM')}</span>
                          <span className="text-foreground">
                            {getCurrencySymbol(packageData.currency)}
                            {currency === 'IDR'
                              ? Math.round(parseFloat(packageData.retailPrice || packageData.price || '0')).toLocaleString('id-ID')
                              : (packageData.retailPrice || packageData.price)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('app.checkout.subtotal', 'Subtotal ({quantity} eSIMs)', { quantity: String(quantity) })}</span>
                          <span className="text-foreground">
                            {getCurrencySymbol(packageData.currency)}
                            {currency === 'IDR'
                              ? Math.round(parseFloat(packageData.retailPrice || packageData.price || '0') * quantity).toLocaleString('id-ID')
                              : (
                                  parseFloat(packageData.retailPrice || packageData.price) * quantity
                                ).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}

                    {(appliedPromo || appliedReferralCredits > 0) && (
                      <div className="space-y-2 mb-4 pb-4 border-b border-border">
                        {/* {appliedPromo && (
                        <div className="flex justify-between text-sm">
                          <span className="text-green-600 dark:text-green-400">
                            Promo Discount ({appliedPromo.code})
                          </span>
                          <span className="text-green-600 dark:text-green-400">
                            -{getCurrencySymbol(packageData.currency)}
                            {appliedPromo.discount.toFixed(2)}
                          </span>
                        </div>
                      )} */}

                        {appliedPromo && (
                          <div className="flex justify-between text-sm">
                            <span className="text-green-600 dark:text-green-400">
                              {appliedPromo.type === 'voucher' &&
                                t('app.checkout.voucherApplied', 'Voucher Applied ({code})', { code: appliedPromo.code })}
                              {appliedPromo.type === 'giftcard' &&
                                t('app.checkout.giftCardApplied', 'Gift Card Applied ({code})', { code: appliedPromo.code })}
                              {appliedPromo.type === 'referral' &&
                                t('app.checkout.referralApplied', 'Referral Applied ({code})', { code: appliedPromo.code })}
                            </span>
                            <span className="text-green-600 dark:text-green-400">
                              -{getCurrencySymbol(packageData.currency)}
                              {appliedPromo.discount.toFixed(2)}
                            </span>
                          </div>
                        )}

                        {appliedReferralCredits > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-amber-600 dark:text-amber-400">
                              {t('app.checkout.referralCredits', 'Referral Credits')}
                            </span>
                            <span className="text-amber-600 dark:text-amber-400">
                              -{getCurrencySymbol(packageData.currency)}
                              {appliedReferralCredits.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {(() => {
                      const basePrice = parseFloat(packageData?.retailPrice || packageData?.price || '0');
                      const subtotal = basePrice * quantity;
                      const discount = (appliedPromo?.discount || 0) + appliedReferralCredits;
                      const finalAmount = subtotal - discount;

                      const thresholdUSD = minOrderSetting ? parseFloat(minOrderSetting) : 0.50;
                      const targetUSD = maxRoundupSetting ? parseFloat(maxRoundupSetting) : 0.70;

                      const currentRate = parseFloat(currencies.find(c => c.code === currency)?.conversionRate || '1');
                      const threshold = thresholdUSD * currentRate;
                      const target = targetUSD * currentRate;

                      if (finalAmount > 0 && finalAmount < threshold) {
                        return (
                          <div className="flex justify-between text-xs text-muted-foreground italic mb-2">
                            <span>{t('app.checkout.smallOrderAdjustment', 'Small order adjustment')}</span>
                            <span>
                              +{getCurrencySymbol(packageData.currency)}
                              {(target - finalAmount).toFixed(2)}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-foreground">{t('app.checkout.total', 'Total')}</span>
                      <span className="text-2xl font-bold text-foreground">
                        {getCurrencySymbol(packageData.currency)}
                        {currency === 'IDR' ? Math.round(Number(calculateTotal())).toLocaleString('id-ID') : calculateTotal()}
                      </span>
                    </div>

                    {isFreeOrder && (
                      <div className="mt-2 text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
                        {t('app.checkout.fullyCovered', 'Fully covered by credits. No payment required.')}
                      </div>
                    )}

                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-500/10 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-green-700 dark:text-green-400">
                          {t('app.checkout.instantActivation', 'Instant activation after payment.')}{' '}
                          {quantity > 1 ? t('app.checkout.esimsWillBeReady', 'Your {quantity} eSIMs will be ready immediately.', { quantity: String(quantity) }) : t('app.checkout.esimWillBeReady', 'Your eSIM will be ready immediately.')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* <SiteFooter /> */}
      
      <CoverageCountriesModal
        isOpen={isCoverageOpen}
        onOpenChange={setIsCoverageOpen}
        countryCodes={coverageModalCountries}
        title={coverageModalTitle}
      />
    </div>
  );
}
