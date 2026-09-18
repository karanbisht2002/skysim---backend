import { Router } from 'express';
import { eq, asc, and } from 'drizzle-orm';
import { db } from 'server/db';
import { paymentGateways, supportedCurrency, currencyRates, orders } from '@shared/schema';
import { initStripePayment } from '../helpers/payments/stripe';
import { initRazorpayPayment } from '../helpers/payments/razorpay';
import { initPaypalPayment } from '../helpers/payments/paypal';
import { initPaystackPayment } from '../helpers/payments/paystack';
import initFlutterwavePayment from '../helpers/payments/flutterwave';
import { requireAuth, optionalAuth } from 'server/lib/middleware';
import { calculateFinalPrice } from 'server/helpers/calculatePricing';
import verifyPaypal from 'server/helpers/payments/verify/paypal';
import verifyPaystack from 'server/helpers/payments/verify/paystack';
import verifyFlutterwave from 'server/helpers/payments/verify/flutterwave';
import verifyRazorpay from 'server/helpers/payments/verify/razorpay';
import verifyStripe from 'server/helpers/payments/verify/stripe';
import { initYookassaPayment } from '../helpers/payments/yookassa';
import verifyYookassa from 'server/helpers/payments/verify/yookassa';
import { initMidtransPayment } from '../helpers/payments/midtrans';
import verifyMidtrans from 'server/helpers/payments/verify/midtrans';
import crypto from 'crypto';
import { storage } from 'server/storage';
import { confirmPowertranzPayment, initPowertranzSpiSale } from 'server/services/powertranz.service';
import { initPowertranzHpp } from 'server/services/powertranz-hpp.service';
// import { confirmPowertranzPayment } from 'server/helpers/payments/verify/confirmPowertranzPayment';
// import { initPowertranzSpiSale } from 'server/helpers/payments/powertranz';

const router = Router();

router.get('/gateways', async (req, res) => {
  const currencyCode = req.query.currency as string | undefined;

  const inAppPurchaseSetting = await storage.getSettingByKey('in_app_purchase') || false;
  const inAppPurchase = inAppPurchaseSetting?.value === 'true';

  // gateways is an array
  let gateways;

  // 👉 CASE 1: currency NOT provided → show all enabled gateways
  if (!currencyCode) {
    gateways = await db
      .select({
        id: paymentGateways.id,
        provider: paymentGateways.provider,
        displayName: paymentGateways.displayName,
        publicKey: paymentGateways.publicKey,
      })
      .from(paymentGateways)
      .where(eq(paymentGateways.isEnabled, true))
      .orderBy(
        asc(paymentGateways.provider),
        asc(paymentGateways.displayName)
      );

    return res.json({
      success: true,
      data: gateways,
      inAppPurchase,
      note: 'All enabled gateways (no currency filter)',
    });
  }

  // 👉 CASE 2: currency provided → validate
  const [currency] = await db
    .select({ id: currencyRates.id })
    .from(currencyRates)
    .where(eq(currencyRates.code, currencyCode.toUpperCase()));

  if (!currency) {
    return res.status(400).json({
      success: false,
      message: `Unsupported currency: ${currencyCode}`,
    });
  }

  // 👉 CASE 3: currency based filtering with support status
  const allGateways = await db
    .select({
      id: paymentGateways.id,
      provider: paymentGateways.provider,
      displayName: paymentGateways.displayName,
      publicKey: paymentGateways.publicKey,
    })
    .from(paymentGateways)
    .where(eq(paymentGateways.isEnabled, true))
    .orderBy(
      asc(paymentGateways.provider),
      asc(paymentGateways.displayName)
    );

  const supportedRows = await db
    .select({
      gatewayId: supportedCurrency.paymentGatewayId,
      code: currencyRates.code,
    })
    .from(supportedCurrency)
    .innerJoin(currencyRates, eq(supportedCurrency.currencyId, currencyRates.id));

  gateways = allGateways.map((g) => {
    const supportedList = supportedRows
      .filter((r) => r.gatewayId === g.id)
      .map((r) => r.code.toUpperCase());

    const isSupported =
      supportedList.length === 0 || supportedList.includes(currencyCode.toUpperCase());

    return {
      ...g,
      isSupported,
      supportedCurrencies: supportedList,
    };
  });

  res.json({
    success: true,
    data: gateways,
    inAppPurchase,
    currency: currencyCode.toUpperCase(),
  });
});


// router.post('/init', optionalAuth, async (req, res) => {
//   try {
//     const {
//       gatewayId,
//       packageId,
//       quantity = 1,
//       currency,
//       orderId,
//       promoCode,
//       promoType,
//       voucherId,
//       giftCardId,
//       referralCredits,
//       email,
//       name,
//       phone,
//     } = req.body;

//     const guestAccessToken = req.userId ? null : crypto.randomUUID();

//     /* ---------------- Validation ---------------- */
//     if (!packageId || !orderId || !currency) {
//       return res.status(400).json({
//         success: false,
//         message: 'Missing required fields',
//       });
//     }

//     if (!req.userId && !email) {
//       return res.status(400).json({
//         success: false,
//         message: 'Email is required for guest checkout',
//       });
//     }

//     /* ---------------- Pricing ---------------- */
//     const pricing = await calculateFinalPrice({
//       packageId,
//       quantity,
//       requestedCurrency: currency,
//       promoCode,
//       promoType,
//       voucherId,
//       giftCardId,
//       referralCredits,
//       userId: req.userId,
//     });

//     /* ---------------- Gateway ---------------- */
//     const [gateway] = await db
//       .select()
//       .from(paymentGateways)
//       .where(eq(paymentGateways.id, gatewayId));

//     if (!gateway || !gateway.isEnabled) {
//       return res.status(400).json({
//         success: false,
//         message: 'Selected payment gateway is disabled',
//       });
//     }

//     let result: any;

//     const payment = {
//       provider: gateway.provider,
//       clientSecret: null as string | null,
//       paymentIntentId: null as string | null,
//       orderId: null as string | null,
//       redirectUrl: null as string | null,
//       publicKey: null as string | null,
//       guestAccessToken: guestAccessToken,
//       amount: null as number | null,
//       currency: currency,
//     };

//     /* ---------------- Init Payment ---------------- */
//     switch (gateway.provider) {

//       case 'stripe':
//         result = await initStripePayment({
//           secretKey: gateway.secretKey!,
//           amount: pricing.total,
//           currency,
//           packageId,
//           quantity,
//           orderId,
//           userId: req.userId,
//           email,
//           name,
//           phone,
//           metadata: {
//             promoCode,
//             promoType,
//             voucherId,
//             giftCardId,
//             referralCredits,
//             promoDiscount: pricing?.discount,
//           },
//         });

//         payment.clientSecret = result.clientSecret;
//         payment.paymentIntentId = result.paymentIntentId;
//         payment.guestAccessToken = result.guestAccessToken ?? null;
//         payment.amount = pricing.total;
//         payment.currency = currency;
//         break;
//       case 'razorpay':
//         result = await initRazorpayPayment({
//           keyId: gateway.publicKey!,
//           secretKey: gateway.secretKey!,
//           amount: pricing.total,
//           currency,
//           orderId,
//           packageId,
//           quantity,
//           email: email || undefined,
//           phone,
//           guestAccessToken: payment.guestAccessToken,
//           userId: req.userId,
//           promoCode,
//           promoType,
//           voucherId,
//           giftCardId,
//           referralCredits,
//           promoDiscount: pricing?.discount,
//         });

//         payment.orderId = result.orderId;
//         payment.publicKey = result.keyId;
//         payment.amount = Math.round(pricing.total * 100);
//         payment.currency = currency;
//         break;

//       case 'paypal':
//         result = await initPaypalPayment({
//           clientId: gateway.publicKey!,
//           secretKey: gateway.secretKey!,
//           amount: pricing.total,
//           currency,
//           packageId,
//           quantity,
//           email: email || undefined,
//           phone: phone,
//           guestAccessToken: payment.guestAccessToken,
//           userId: req.userId,
//           promoCode,
//           promoType,
//           voucherId,
//           giftCardId,
//           referralCredits,
//           promoDiscount: pricing?.discount,
//         });

//         payment.orderId = result.orderId;
//         payment.amount = pricing.total;
//         payment.currency = currency;
//         break;

//       case 'paystack':
//         if (!email) {
//           return res.status(400).json({
//             success: false,
//             message: 'Email is required for Paystack payment',
//           });
//         }

//         result = await initPaystackPayment({
//           secretKey: gateway.secretKey!,
//           email,
//           amount: pricing.total,
//           currency,
//           promoCode,
//           promoType,
//           voucherId,
//           giftCardId,
//           referralCredits,
//         });

//         payment.orderId = result.reference;
//         payment.redirectUrl = result.authorizationUrl;
//         payment.amount = Math.round(pricing.total * 100);
//         payment.currency = currency;
//         break;


//       case "powertranz":
//         result = await initPowertranzSpiSale({
//           merchantId: gateway.publicKey!,
//           merchantPassword: gateway.secretKey!,
//           amount: pricing.total,
//           orderId,
//           currency,
//           email,
//           name,
//           // card: req.body.card, // 🔥 REQUIRED
//           card: {
//             pan: "4012000000020006",
//             cvv: "323",
//             expiry: "2310",
//           },
//         });

//         payment.provider = "powertranz";
//         payment.amount = pricing.total;
//         payment.currency = currency;

//         return res.json({
//           success: true,
//           message: "3DS authentication required",
//           pricing,
//           powertranz: {
//             orderId,
//             redirectData: result.redirectData, // 🔥 frontend iframe
//             spiToken: result.spiToken,         // store client-side for confirm
//           },
//         });
//       default:
//         return res.status(400).json({
//           success: false,
//           message: 'Unsupported payment provider',
//         });
//     }
//     /* ---------------- Final Response ---------------- */
//     return res.json({
//       success: true,
//       message: 'Payment initialized successfully',
//       pricing,
//       payment,
//     });
//   } catch (error: any) {
//     console.error('Payment init error:', error);

//     return res.status(500).json({
//       success: false,
//       message: error?.message || error?.error || 'Payment initialization failed',
//     });
//   }
// });


/**
 * Initialize Payment
 * Supports: Stripe, Razorpay, PayPal, Paystack, PowerTranz (SPI), PowerTranz (HPP)
 */
router.post('/init', optionalAuth, async (req, res) => {
  try {
    const {
      gatewayId,
      packageId,
      quantity = 1,
      currency,
      orderId,
      promoCode,
      promoType,
      voucherId,
      giftCardId,
      referralCredits,
      email,
      name,
      phone,
      card, // 🔥 Card data from frontend (only for PowerTranz SPI)
      paymentMethod = 'spi', // 'spi' or 'hpp' for PowerTranz
    } = req.body;

    // 🔍 Validate if req.userId belongs to a real user (not an admin)
    const user = req.userId ? await storage.getUserById(req.userId) : null;
    if (!user) {
      req.userId = undefined;
    }

    const guestAccessToken = req.userId ? null : crypto.randomUUID();

    /* ---------------- Validation ---------------- */
    if (!packageId || !orderId || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    if (!req.userId && !email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required for guest checkout',
      });
    }

    /* ---------------- Pricing ---------------- */
    const pricing = await calculateFinalPrice({
      packageId,
      quantity,
      requestedCurrency: currency,
      promoCode,
      promoType,
      voucherId,
      giftCardId,
      referralCredits,
      userId: req.userId,
    });

    /* ---------------- FREE ORDER BYPASS ---------------- */
    // If entire order is covered by promo/credits, directly confirm without gateway
    if (pricing.total <= 0) {
      console.log('🎉 Processing FREE order via giftcard/promo:', orderId);
      return res.json({
        success: true,
        builtInComplete: true,
        message: 'Order fully covered by promotions',
        payment: {
          provider: 'free',
          guestAccessToken,
          amount: 0,
          currency,
          orderId,
        },
        pricing,
      });
    }

    /* ---------------- Gateway Validation ---------------- */
    const [gateway] = await db
      .select()
      .from(paymentGateways)
      .where(eq(paymentGateways.id, gatewayId));

    if (!gateway || !gateway.isEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Selected payment gateway is disabled',
      });
    }

    // Check if gateway supports the requested currency
    const supportedCurrenciesForGateway = await db
      .select({ code: currencyRates.code })
      .from(supportedCurrency)
      .innerJoin(currencyRates, eq(supportedCurrency.currencyId, currencyRates.id))
      .where(eq(supportedCurrency.paymentGatewayId, gateway.id));

    if (
      supportedCurrenciesForGateway.length > 0 &&
      !supportedCurrenciesForGateway.some((c) => c.code.toUpperCase() === currency.toUpperCase())
    ) {
      return res.status(400).json({
        success: false,
        message: `${gateway.displayName || gateway.provider} does not support ${currency}. Please select another payment method.`,
      });
    }

    let result: any;

    const payment = {
      provider: gateway.provider,
      clientSecret: null as string | null,
      paymentIntentId: null as string | null,
      orderId: null as string | null,
      redirectUrl: null as string | null,
      publicKey: null as string | null,
      guestAccessToken: guestAccessToken,
      amount: null as number | null,
      currency: currency,
      paymentMethod: null as string | null, // 'spi' or 'hpp'
    };

    /* ========================
       PAYMENT GATEWAY ROUTING
       ======================== */

    switch (gateway.provider) {
      case 'stripe':
        result = await initStripePayment({
          secretKey: gateway.secretKey!,
          amount: pricing.total,
          currency,
          packageId,
          quantity,
          orderId,
          userId: req.userId,
          email,
          name,
          phone,
          metadata: {
            promoCode,
            promoType,
            voucherId,
            giftCardId,
            referralCredits,
            promoDiscount: pricing?.discount,
          },
        });

        payment.clientSecret = result.clientSecret;
        payment.publicKey = gateway.publicKey!;
        payment.paymentIntentId = result.paymentIntentId;
        payment.guestAccessToken = result.guestAccessToken ?? null;
        payment.amount = pricing.total;
        payment.currency = currency;
        break;

      case 'razorpay':
        result = await initRazorpayPayment({
          keyId: gateway.publicKey!,
          secretKey: gateway.secretKey!,
          amount: pricing.total,
          currency,
          orderId,
          packageId,
          quantity,
          email: email || undefined,
          phone,
          guestAccessToken: payment.guestAccessToken,
          userId: req.userId,
          promoCode,
          promoType,
          voucherId,
          giftCardId,
          referralCredits,
          promoDiscount: pricing?.discount,
        });

        payment.orderId = result.orderId;
        payment.publicKey = result.keyId;
        payment.amount = Math.round(pricing.total * 100);
        payment.currency = currency;
        break;

      case 'paypal':
        result = await initPaypalPayment({
          clientId: gateway.publicKey!,
          secretKey: gateway.secretKey!,
          mode: (gateway.config as any)?.mode || 'sandbox',
          amount: pricing.total,
          currency,
          packageId,
          quantity,
          email: email || undefined,
          phone: phone,
          guestAccessToken: payment.guestAccessToken,
          userId: req.userId,
          promoCode,
          promoType,
          voucherId,
          giftCardId,
          referralCredits,
          promoDiscount: pricing?.discount,
        });

        payment.orderId = result.orderId;
        payment.amount = pricing.total;
        payment.currency = currency;
        payment.publicKey = gateway.publicKey;
        payment.clientSecret = gateway.secretKey;
        (payment as any).mode = (gateway.config as any)?.mode || 'sandbox';
        break;

      case 'paystack':
        if (!email) {
          return res.status(400).json({
            success: false,
            message: 'Email is required for Paystack payment',
          });
        }

        const paystackBaseUrl = req.protocol + "://" + req.get("host");
        const paystackParams = new URLSearchParams({ providerType: 'paystack' });
        if (payment.guestAccessToken) {
          paystackParams.set('guestAccessToken', payment.guestAccessToken);
        }
        const paystackRedirectUrl = req.body.redirectUrl || `${paystackBaseUrl}/order/processing?${paystackParams.toString()}`;

        result = await initPaystackPayment({
          secretKey: gateway.secretKey!,
          email,
          amount: pricing.total,
          currency,
          callbackUrl: paystackRedirectUrl,
          metadata: {
            promoCode,
            promoType,
            voucherId,
            giftCardId,
            referralCredits,
          },
        });

        payment.orderId = result.reference;
        payment.redirectUrl = result.authorizationUrl;
        payment.amount = Math.round(pricing.total * 100);
        payment.currency = currency;
        break;

      case 'flutterwave':
        if (!email) {
          return res.status(400).json({
            success: false,
            message: 'Email is required for Flutterwave payment',
          });
        }

        const flutterwaveBaseUrl = req.protocol + "://" + req.get("host");
        const flutterwaveParams = new URLSearchParams({ providerType: 'flutterwave' });
        if (payment.guestAccessToken) {
          flutterwaveParams.set('guestAccessToken', payment.guestAccessToken);
        }
        const flutterwaveRedirectUrl = req.body.redirectUrl || `${flutterwaveBaseUrl}/order/processing?${flutterwaveParams.toString()}`;

        result = await initFlutterwavePayment({
          secretKey: gateway.secretKey!,
          email,
          amount: pricing.total,
          currency,
          orderId: orderId,
          name: name,
          phone: phone,
          redirectUrl: flutterwaveRedirectUrl,
          metadata: {
            promoCode,
            promoType,
            voucherId,
            giftCardId,
            referralCredits,
          },
        });

        payment.orderId = result.reference;
        payment.redirectUrl = result.authorizationUrl;
        payment.amount = pricing.total;
        payment.currency = currency;
        break;

      case 'yookassa':
        if (!email) {
          return res.status(400).json({
            success: false,
            message: 'Email is required for YooKassa payment',
          });
        }

        const yookassaBaseUrl = req.protocol + "://" + req.get("host");
        const yookassaParams = new URLSearchParams({
          providerType: 'yookassa',
          orderId: orderId,
        });
        if (payment.guestAccessToken) {
          yookassaParams.set('guestAccessToken', payment.guestAccessToken);
        }
        const yookassaRedirectUrl = req.body.redirectUrl || `${yookassaBaseUrl}/order/processing?${yookassaParams.toString()}`;

        result = await initYookassaPayment({
          shopId: gateway.publicKey!,
          secretKey: gateway.secretKey!,
          amount: pricing.total,
          currency,
          orderId,
          redirectUrl: yookassaRedirectUrl,
          metadata: {
            type: req.userId ? 'package_purchase' : 'guest_purchase',
            packageId,
            quantity: String(quantity),
            orderId,
            userId: req.userId ? String(req.userId) : '',
            guestEmail: email || '',
            guestPhone: phone || '',
            guestAccessToken: guestAccessToken || '',
            promoCode,
            promoType,
            voucherId,
            giftCardId,
            referralCredits,
            existingOrderId: orderId,
          },
        });

        // Create or update pending order to store YooKassa payment ID
        const pkg = await storage.getUnifiedPackageById(packageId);
        if (pkg) {
          const existingOrder = await storage.getOrderById(orderId);
          if (existingOrder) {
            await storage.updateOrder(orderId, {
              status: 'pending',
              price: pricing.total.toString(),
              stripePaymentIntentId: result.reference,
              guestEmail: email || null,
              guestPhone: phone || null,
              guestAccessToken: payment.guestAccessToken || null,
            });
          } else {
            await storage.createOrder({
              id: orderId,
              userId: req.userId || null,
              packageId: pkg.id,
              orderType: 'single',
              quantity: 1,
              status: 'pending',
              price: pricing.total.toString(),
              airaloPrice: pkg.wholesalePrice,
              currency: currency,
              orderCurrency: currency,
              dataAmount: pkg.dataAmount,
              validity: pkg.validity,
              installationSent: false,
              stripePaymentIntentId: result.reference,
              providerId: pkg.providerId,
              paymentMethod: 'card',
              guestEmail: email || null,
              guestPhone: phone || null,
              guestAccessToken: payment.guestAccessToken || null,
            });
          }
        }

        payment.orderId = orderId;
        payment.redirectUrl = result.authorizationUrl;
        payment.amount = pricing.total;
        payment.currency = currency;
        payment.paymentIntentId = result.reference;
        break;

      /* ========================
         POWERTRANZ INTEGRATION
         ======================== */

      case 'powertranz':
        // 🔥 NEW: Support both SPI and HPP methods
        if (paymentMethod === 'hpp') {
          // ========================
          // HPP METHOD (HOSTED PAGE)
          // ========================
          console.log('🎯 Initializing PowerTranz HPP (Hosted Payment Page)');

          result = await initPowertranzHpp({
            merchantId: gateway.publicKey!,
            merchantPassword: gateway.secretKey!,
            amount: pricing.total,
            orderId,
            currency,
            email,
            name,
            phone,
          });

          console.log('✅ PowerTranz HPP initialized:', {
            hasRedirectUrl: !!result.redirectUrl,
            hppToken: result.hppToken?.substring(0, 20) + '...',
          });

          // Return HPP redirect response
          return res.json({
            success: true,
            message: 'HPP payment page initialized',
            pricing,
            powertranz: {
              method: 'hpp',
              redirectUrl: result.redirectUrl, // Frontend redirects user to this URL
              hppToken: result.hppToken,
            },
            payment: {
              provider: 'powertranz',
              paymentMethod: 'hpp',
              guestAccessToken,
              amount: pricing.total,
              currency,
              orderId,
            },
          });

        } else {
          // ========================
          // SPI METHOD (3DS IFRAME)
          // ========================
          // 🔥 Validate card data is provided for SPI
          if (!card || !card.pan || !card.cvv || !card.expiry) {
            return res.status(400).json({
              success: false,
              message: 'Card details are required for PowerTranz SPI payment',
            });
          }

          console.log('🔥 Initializing PowerTranz SPI (3DS Challenge)');

          result = await initPowertranzSpiSale({
            merchantId: gateway.publicKey!,
            merchantPassword: gateway.secretKey!,
            amount: pricing.total,
            orderId,
            currency,
            email,
            name,
            card,
          });

          console.log('✅ PowerTranz SPI response:', {
            IsoResponseCode: result.IsoResponseCode,
            hasSpiToken: !!result.spiToken,
            hasRedirectData: !!result.redirectData,
          });

          // Return 3DS data for frontend iframe
          return res.json({
            success: true,
            message: '3DS authentication required',
            pricing,
            powertranz: {
              method: 'spi',
              orderId,
              redirectData: result.redirectData, // HTML for iframe
              spiToken: result.spiToken, // Store for confirmation
            },
            payment: {
              provider: 'powertranz',
              paymentMethod: 'spi',
              guestAccessToken,
              amount: pricing.total,
              currency,
            },
          });
        }

      case 'midtrans':
        const midtransPkg = await storage.getUnifiedPackageById(packageId);

        // Midtrans operates strictly in Indonesian Rupiah (IDR).
        // If checkout currency is IDR, pricing.total is already the exact IDR amount.
        // If checkout is in USD or other currency, convert pricing.totalUSD to IDR.
        let midtransAmount = Math.round(pricing.total);
        if (currency.toUpperCase() !== 'IDR') {
          const allCurrs = await storage.getCurrencies();
          const idrCurrency = allCurrs.find((c) => c.code.toUpperCase() === 'IDR');
          const idrRate = parseFloat(idrCurrency?.conversionRate || '18050');
          midtransAmount = Math.round((pricing.totalUSD || pricing.total) * idrRate);
        }

        result = await initMidtransPayment({
          serverKey: gateway.secretKey!,
          clientKey: gateway.publicKey || undefined,
          merchantId: (gateway.config as any)?.merchantId,
          mode: (gateway.config as any)?.mode || 'test',
          amount: midtransAmount,
          currency: 'IDR',
          orderId,
          packageId,
          quantity,
          email,
          name,
          phone,
          metadata: {
            orderId,
            existingOrderId: orderId,
            promoCode,
            promoType,
            voucherId,
            giftCardId,
            referralCredits,
            promoDiscount: pricing?.discount,
            packageTitle: midtransPkg?.title,
          },
        });

        // Ensure order record exists in database for webhook lookup
        if (midtransPkg) {
          const existingOrder = await storage.getOrderById(orderId);
          if (existingOrder) {
            await storage.updateOrder(orderId, {
              status: 'pending',
              price: pricing.total.toString(),
              stripePaymentIntentId: result.token,
              guestEmail: email || null,
              guestPhone: phone || null,
              guestAccessToken: payment.guestAccessToken || null,
            });
          } else {
            await storage.createOrder({
              id: orderId,
              userId: req.userId || null,
              packageId: midtransPkg.id,
              orderType: 'single',
              quantity: quantity || 1,
              status: 'pending',
              price: pricing.total.toString(),
              airaloPrice: midtransPkg.wholesalePrice,
              currency: currency,
              orderCurrency: currency,
              dataAmount: midtransPkg.dataAmount,
              validity: midtransPkg.validity,
              installationSent: false,
              stripePaymentIntentId: result.token,
              providerId: midtransPkg.providerId,
              paymentMethod: 'midtrans',
              guestEmail: email || null,
              guestPhone: phone || null,
              guestAccessToken: payment.guestAccessToken || null,
            });
          }
        }

        payment.orderId = orderId;
        payment.redirectUrl = result.redirectUrl;
        payment.amount = pricing.total;
        payment.currency = currency;
        payment.publicKey = gateway.publicKey;
        (payment as any).token = result.token;
        (payment as any).mode = (gateway.config as any)?.mode || 'test';
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported payment provider',
        });
    }

    /* ========================
       FINAL RESPONSE (non-PowerTranz)
       ======================== */
    return res.json({
      success: true,
      message: 'Payment initialized successfully',
      pricing,
      payment,
    });

  } catch (error: any) {
    console.error('Payment init error:', error);

    return res.status(500).json({
      success: false,
      message: error?.message || error?.error || 'Payment initialization failed',
    });
  }
});

/**
 * PowerTranz HPP Callback Handler
 * Called by PowerTranz (via frontend redirect) after user completes payment
 */
router.post('/powertranz/hpp-callback', async (req, res) => {
  try {
    console.log('🔐 [HPP CALLBACK RECEIVED]', {
      timestamp: new Date().toISOString(),
      method: req.method,
      hasApproved: !!req.body.Approved,
    });

    // Parse callback response
    const callbackData = req.body;

    // Process the HPP callback
    const result = processHppCallbackResponse(callbackData);

    if (result.success && result.approved) {
      console.log('✅ HPP payment APPROVED - updating order status');

      // Update order status in database
      try {
        await db
          .update(orders)
          .set({
            status: 'completed',
            paymentMethod: 'powertranz-hpp',
            transactionId: result.transactionId,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, result.orderId!));

        console.log('✅ Order updated in database');
      } catch (dbError: any) {
        console.error('❌ Database update error:', dbError);
        // Even if DB update fails, payment was approved
      }

      // ✅ Return success response
      return res.status(200).json({
        success: true,
        message: 'Payment confirmed successfully',
        transactionId: result.transactionId,
        orderId: result.orderId,
      });

    } else if (result.success && !result.approved) {
      // Payment was declined
      console.warn('⚠️ HPP payment DECLINED');

      return res.status(200).json({
        success: false,
        message: result.message || 'Payment was declined',
        error: result.error,
        orderId: result.orderId,
      });

    } else {
      // Error processing callback
      return res.status(400).json({
        success: false,
        message: 'Error processing payment callback',
        error: result.error,
      });
    }

  } catch (error: any) {
    console.error('❌ HPP callback error:', error);

    return res.status(500).json({
      success: false,
      message: error?.message || 'HPP callback processing failed',
    });
  }
});

/**
 * PowerTranz HPP Cancel Handler
 * Called when user cancels payment on HPP page
 */
router.get('/powertranz/hpp-cancel', (req, res) => {
  console.log('⚠️ HPP payment CANCELLED by user');

  // Redirect to checkout with error
  res.redirect(
    `/checkout?error=${encodeURIComponent('Payment was cancelled. Please try again.')}`
  );
});

/**
 * PowerTranz HPP Server Notification
 * Optional: Server-to-server notification (more reliable than callback)
 */
router.post('/powertranz/hpp-notify', async (req, res) => {
  try {
    console.log('📬 [HPP SERVER NOTIFICATION RECEIVED]', {
      timestamp: new Date().toISOString(),
      hasApproved: !!req.body.Approved,
    });

    const notificationData = req.body;

    // Process notification (similar to callback)
    const result = processHppCallbackResponse(notificationData);

    if (result.success && result.approved) {
      console.log('✅ HPP notification: Payment APPROVED');

      // Update order status
      await db
        .update(orders)
        .set({
          status: 'completed',
          paymentMethod: 'powertranz-hpp',
          transactionId: result.transactionId,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, result.orderId!));

      // Return 200 OK to acknowledge notification
      return res.status(200).json({ success: true });

    } else {
      console.warn('⚠️ HPP notification: Payment DECLINED');
      return res.status(200).json({ success: true });
    }

  } catch (error: any) {
    console.error('❌ HPP notification error:', error);
    // Still return 200 to avoid retries
    return res.status(200).json({ success: true, warning: error.message });
  }
});

/**
 * PowerTranz SPI: 3DS Response Handler (existing)
 */
router.post('/powertranz/3ds-response', (req, res) => {
  console.log('🔐 [3DS CALLBACK RECEIVED]', {
    timestamp: new Date().toISOString(),
    method: req.method,
    contentType: req.headers['content-type'],
  });

  let responseData = req.body;
  if (req.body.Response && typeof req.body.Response === 'string') {
    try {
      responseData = JSON.parse(req.body.Response);
    } catch (e) {
      console.error('❌ Failed to parse Response:', e.message);
    }
  }

  const {
    TransactionType,
    Approved,
    TransactionIdentifier,
    TotalAmount,
    CurrencyCode,
    CardBrand,
    IsoResponseCode,
    ResponseMessage,
    RiskManagement,
    PanToken,
    OrderIdentifier,
    Errors,
    SpiToken,
  } = responseData;

  console.log('🔐 Parsed Response:', {
    IsoResponseCode,
    ResponseMessage,
    Approved,
    hasSpiToken: !!SpiToken,
  });

  res.setHeader('Content-Type', 'text/html');

  let isSuccess = false;
  let failureReason = '';

  if (RiskManagement?.ThreeDSecure) {
    const threeDSData = RiskManagement.ThreeDSecure;
    if (threeDSData.ResponseCode === '3D0' || IsoResponseCode === '3D0') {
      isSuccess = true;
    } else {
      failureReason = threeDSData.CardholderInfo || ResponseMessage || 'Authentication failed';
    }
  } else if (IsoResponseCode === 'SP4') {
    isSuccess = true;
  } else if (Errors && Errors.length > 0) {
    failureReason = Errors.map((e: any) => e.Message).join(', ');
  }

  const finalSpiToken = SpiToken || req.body.SpiToken;

  console.log('🔐 3DS Result:', {
    isSuccess,
    IsoResponseCode,
    spiToken: finalSpiToken?.substring(0, 20) + '...',
  });

  const htmlResponse = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>3DS Result</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            backdrop-filter: blur(10px);
          }
          .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top: 4px solid white;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h2>${isSuccess ? '✅ Authentication Successful' : '❌ Authentication Failed'}</h2>
          <p>${isSuccess ? 'Processing your payment...' : failureReason}</p>
        </div>
        
        <script>
          console.log('[3DS IFRAME] Page loaded, about to send postMessage...');
          
          const messageData = {
            type: 'POWERTRANZ_3DS_RESULT',
            success: ${isSuccess ? 'true' : 'false'},
            spiToken: '${finalSpiToken || ''}',
            isoResponseCode: '${IsoResponseCode}',
            responseMessage: '${ResponseMessage}',
            transactionIdentifier: '${TransactionIdentifier}',
            orderIdentifier: '${OrderIdentifier}',
            failureReason: '${failureReason.replace(/'/g, "\\'")}',
            timestamp: new Date().toISOString(),
          };
          
          try {
            window.parent.postMessage(messageData, '*');
            setTimeout(() => {
              window.parent.postMessage(messageData, '*');
            }, 100);
          } catch (error) {
            console.error('[3DS IFRAME] ❌ postMessage failed:', error);
          }
        </script>
      </body>
    </html>
  `;

  console.log('📤 Sending 3DS response HTML to client');
  res.send(htmlResponse);
});

/**
 * PowerTranz SPI: Confirm Payment (existing)
 */
router.post('/powertranz/confirm', optionalAuth, async (req, res) => {
  try {
    const { spiToken, orderId, guestAccessToken } = req.body;

    console.log('🔥 Confirming PowerTranz SPI payment:', {
      hasSpiToken: !!spiToken,
      orderId,
      hasGuestToken: !!guestAccessToken,
    });

    if (!spiToken || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: spiToken and orderId are required',
      });
    }

    const merchantId = process.env.POWERTRANZ_MERCHANT_ID;
    const merchantPassword = process.env.POWERTRANZ_MERCHANT_PASSWORD;

    if (!merchantId || !merchantPassword) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured properly',
      });
    }

    let confirmResult;
    try {
      confirmResult = await confirmPowertranzPayment({
        spiToken,
        merchantId,
        merchantPassword,
      });
    } catch (serviceError: any) {
      console.error('❌ PowerTranz service error:', serviceError.message);
      return res.status(500).json({
        success: false,
        message: serviceError.message || 'Failed to confirm payment with PowerTranz',
      });
    }

    console.log('✅ PowerTranz confirmation result:', {
      Approved: confirmResult.Approved,
      IsoResponseCode: confirmResult.IsoResponseCode,
    });

    if (confirmResult.Approved) {
      console.log('✅ Payment APPROVED - updating order status');

      try {
        await db
          .update(orders)
          .set({
            status: 'completed',
            paymentMethod: 'powertranz-spi',
            transactionId: confirmResult.TransactionIdentifier,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId));

        console.log('✅ Order updated in database');
      } catch (dbError: any) {
        console.error('❌ Database update error:', dbError);
        return res.status(200).json({
          success: true,
          message: 'Payment confirmed but order update pending',
          transactionId: confirmResult.TransactionIdentifier,
          orderId,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Payment confirmed successfully',
        transactionId: confirmResult.TransactionIdentifier,
        orderId,
      });
    } else {
      console.warn('⚠️ Payment NOT APPROVED');

      return res.status(200).json({
        success: false,
        message: confirmResult.ResponseMessage || 'Payment was declined',
        isoResponseCode: confirmResult.IsoResponseCode,
        transactionId: confirmResult.TransactionIdentifier,
      });
    }

  } catch (error: any) {
    console.error('❌ PowerTranz confirmation error:', error);

    return res.status(500).json({
      success: false,
      message: error?.message || 'Payment confirmation failed',
    });
  }
});

/*
  ──────────────────────────────────────────────────────────────────────────────
  GET /api/payments/topup/paystack-callback
  ──────────────────────────────────────────────────────────────────────────────
  Paystack redirects the user here after payment (callback_url we set in init).
  We verify the payment, call the confirm-payment logic, then return a small HTML
  page that:
    1. Calls window.SimfinityAndroid.onPaymentSuccess() (Android JS interface)
    2. window.ReactNativeWebView.postMessage()           (React Native)
    3. postMessage to parent                             (Flutter WebView)
    4. Redirects to deep-link scheme                    (e.g. simfinity://payment-success)
  ──────────────────────────────────────────────────────────────────────────────
*/
router.get('/topup/paystack-callback', async (req, res) => {
  const { reference, iccid, orderId, topupId, packageId, callbackScheme = 'simfinity' } = req.query as Record<string, string>;

  const sendHtml = (success: boolean, message: string, extra: Record<string, string> = {}) => {
    const payload = JSON.stringify({ eventType: success ? 'success' : 'failure', iccid, orderId, topupId, message, ...extra });
    const deepLink = success
      ? `${callbackScheme}://payment-success?iccid=${encodeURIComponent(iccid)}&orderId=${encodeURIComponent(orderId)}&topupId=${encodeURIComponent(topupId)}&message=${encodeURIComponent(message)}`
      : `${callbackScheme}://payment-failed?message=${encodeURIComponent(message)}`;

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${success ? 'Payment Successful' : 'Payment Failed'}</title>
      <style>
        body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:100vh;font-family:system-ui,sans-serif;
          background:${success ? 'linear-gradient(135deg,#0f4c3a,#1e293b)' : 'linear-gradient(135deg,#4c0f0f,#1e293b)'};
          color:white;text-align:center;padding:24px;box-sizing:border-box;}
        .icon{font-size:64px;margin-bottom:16px;}
        h2{font-size:22px;font-weight:700;margin:0 0 8px;}
        p{font-size:14px;opacity:.75;margin:0 0 24px;}
        button{padding:12px 28px;border-radius:12px;border:none;cursor:pointer;
          background:${success ? '#10b981' : '#ef4444'};color:white;font-size:15px;font-weight:600;}
      </style>
    </head><body>
      <div class="icon">${success ? '✅' : '❌'}</div>
      <h2>${success ? 'Top-Up Successful!' : 'Payment Failed'}</h2>
      <p>${message}</p>
      <button onclick="closeWindow()">Close</button>
      <script>
        var PAYLOAD = ${payload};
        function closeWindow() {
          try { window.SimfinityAndroid && window.SimfinityAndroid.onPaymentSuccess(JSON.stringify(PAYLOAD)); } catch(e){}
          try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(PAYLOAD)); } catch(e){}
          try { window.parent && window.parent.postMessage(JSON.stringify(PAYLOAD), '*'); } catch(e){}
          try { window.top && window.top.postMessage(JSON.stringify(PAYLOAD), '*'); } catch(e){}
          try { window.location.href = '${deepLink}'; } catch(e){}
        }
        // Auto-trigger after 2s
        setTimeout(closeWindow, 2000);
        // Immediate try
        try {
          if(window.SimfinityAndroid) { ${success
        ? 'window.SimfinityAndroid.onPaymentSuccess(JSON.stringify(PAYLOAD));'
        : 'window.SimfinityAndroid.onPaymentFailure(JSON.stringify(PAYLOAD));'
      } }
          if(window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(PAYLOAD)); }
          if(window.parent) { window.parent.postMessage(JSON.stringify(PAYLOAD), '*'); }
        } catch(e){}
      <\/script>
    </body></html>`);
  };

  try {
    if (!reference) return sendHtml(false, 'Missing Paystack reference');

    // ── Fetch the active Paystack gateway ───────────────────────────────────
    const { paymentGateways } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    const { db } = await import('server/db');
    const [gateway] = await db.select().from(paymentGateways).where(eq(paymentGateways.provider, 'paystack'));
    if (!gateway || !gateway.isEnabled) return sendHtml(false, 'Paystack gateway not configured');

    // ── Verify the transaction with Paystack ────────────────────────────────
    const verifyPaystack = (await import('server/helpers/payments/verify/paystack')).default;
    const verification = await verifyPaystack({ paystack: { reference } }, gateway);
    if (!verification.success) return sendHtml(false, verification.message || 'Paystack payment not verified');

    // ── Call /api/confirm-payment internally ────────────────────────────────
    const axios = (await import('axios')).default;
    const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const confirmRes = await axios.post(`${BASE}/api/confirm-payment`, {
      providerType: 'paystack',
      orderId: reference,  // confirm-payment uses orderId as the reference for paystack
    });

    const confirmData = confirmRes.data;
    if (!confirmData?.success) {
      return sendHtml(false, confirmData?.message || 'Confirmation failed after payment');
    }

    return sendHtml(true, 'Your eSIM has been topped up successfully!', {
      topupRecordId: String(confirmData?.topup?.id || ''),
    });

  } catch (err: any) {
    console.error('[Paystack Callback Error]', err.message);
    return sendHtml(false, err.message || 'An unexpected error occurred');
  }
});

/*
  ──────────────────────────────────────────────────────────────────────────────
  GET /api/payments/topup/flutterwave-callback
  ──────────────────────────────────────────────────────────────────────────────
*/
router.get('/topup/flutterwave-callback', async (req, res) => {
  const { transaction_id, status, tx_ref, iccid, orderId, topupId, packageId, callbackScheme = 'simfinity' } = req.query as Record<string, string>;

  const sendHtml = (success: boolean, message: string, extra: Record<string, string> = {}) => {
    const payload = JSON.stringify({ eventType: success ? 'success' : 'failure', iccid, orderId, topupId, message, ...extra });
    const deepLink = success
      ? `${callbackScheme}://payment-success?iccid=${encodeURIComponent(iccid)}&orderId=${encodeURIComponent(orderId)}&topupId=${encodeURIComponent(topupId)}&message=${encodeURIComponent(message)}`
      : `${callbackScheme}://payment-failed?message=${encodeURIComponent(message)}`;

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${success ? 'Payment Successful' : 'Payment Failed'}</title>
      <style>
        body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:100vh;font-family:system-ui,sans-serif;
          background:${success ? 'linear-gradient(135deg,#0f4c3a,#1e293b)' : 'linear-gradient(135deg,#4c0f0f,#1e293b)'};
          color:white;text-align:center;padding:24px;box-sizing:border-box;}
        .icon{font-size:64px;margin-bottom:16px;}
        h2{font-size:22px;font-weight:700;margin:0 0 8px;}
        p{font-size:14px;opacity:.75;margin:0 0 24px;}
        button{padding:12px 28px;border-radius:12px;border:none;cursor:pointer;
          background:${success ? '#10b981' : '#ef4444'};color:white;font-size:15px;font-weight:600;}
      </style>
    </head><body>
      <div class="icon">${success ? '✅' : '❌'}</div>
      <h2>${success ? 'Top-Up Successful!' : 'Payment Failed'}</h2>
      <p>${message}</p>
      <button onclick="closeWindow()">Close</button>
      <script>
        var PAYLOAD = ${payload};
        function closeWindow() {
          try { window.SimfinityAndroid && window.SimfinityAndroid.onPaymentSuccess(JSON.stringify(PAYLOAD)); } catch(e){}
          try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(PAYLOAD)); } catch(e){}
          try { window.parent && window.parent.postMessage(JSON.stringify(PAYLOAD), '*'); } catch(e){}
          try { window.top && window.top.postMessage(JSON.stringify(PAYLOAD), '*'); } catch(e){}
          try { window.location.href = '${deepLink}'; } catch(e){}
        }
        setTimeout(closeWindow, 2000);
        try {
          if(window.SimfinityAndroid) { ${success
        ? 'window.SimfinityAndroid.onPaymentSuccess(JSON.stringify(PAYLOAD));'
        : 'window.SimfinityAndroid.onPaymentFailure(JSON.stringify(PAYLOAD));'
      } }
          if(window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(PAYLOAD)); }
          if(window.parent) { window.parent.postMessage(JSON.stringify(PAYLOAD), '*'); }
        } catch(e){}
      <\/script>
    </body></html>`);
  };

  try {
    if (status !== 'successful') {
      return sendHtml(false, 'Payment was not successful or was cancelled');
    }
    if (!transaction_id) return sendHtml(false, 'Missing Flutterwave transaction ID');

    // ── Fetch the active Flutterwave gateway ───────────────────────────────────
    const { paymentGateways } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    const { db } = await import('server/db');
    const [gateway] = await db.select().from(paymentGateways).where(eq(paymentGateways.provider, 'flutterwave'));
    if (!gateway || !gateway.isEnabled) return sendHtml(false, 'Flutterwave gateway not configured');

    // ── Verify the transaction with Flutterwave ────────────────────────────────
    const verifyFlutterwave = (await import('server/helpers/payments/verify/flutterwave')).default;
    const verification = await verifyFlutterwave({ transaction_id }, gateway);
    if (!verification.success) return sendHtml(false, verification.message || 'Flutterwave payment not verified');

    // ── Call /api/confirm-payment internally ────────────────────────────────
    const axios = (await import('axios')).default;
    const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const confirmRes = await axios.post(`${BASE}/api/confirm-payment`, {
      providerType: 'flutterwave',
      orderId: tx_ref || verification.referenceId,  // flutterwave uses tx_ref or verification ref
    });

    const confirmData = confirmRes.data;
    if (!confirmData?.success) {
      return sendHtml(false, confirmData?.message || 'Confirmation failed after payment');
    }

    return sendHtml(true, 'Your eSIM has been topped up successfully!', {
      topupRecordId: String(confirmData?.topup?.id || ''),
    });

  } catch (err: any) {
    console.error('[Flutterwave Callback Error]', err.message);
    return sendHtml(false, err.message || 'An unexpected error occurred');
  }
});

router.post('/topup/init', optionalAuth, async (req, res) => {
  try {
    const { gatewayId, packageId, iccid, orderId: rawOrderId, currency = 'USD', email, name, phone, topupId, callbackUrl } = req.body;

    /* ---------------- Validation ---------------- */
    if (!gatewayId || !packageId || !iccid) {
      return res.status(400).json({
        success: false,
        message: 'gatewayId, packageId and iccid are required',
      });
    }

    let orderId = rawOrderId;
    /* ---------------- Verify/Find Order ---------------- */
    let order = orderId ? await storage.getOrderById(orderId) : null;

    if (!order && iccid) {
      order = await storage.getOrderByIccid(iccid);
      if (order) orderId = order.id;
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Original order not found for this eSIM',
      });
    }

    // 🔍 Validate if req.userId belongs to a real user (not an admin)
    const user = req.userId ? await storage.getUserById(req.userId) : null;
    if (!user) {
      req.userId = undefined;
    }

    if (!req.userId && !email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required for guest checkout',
      });
    }
    // if (!order || (order.userId !== req.userId && !req.adminId)) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Access denied",
    //   });
    // }

    /* ---------------- Package ---------------- */
    let pkg = await storage.getUnifiedPackageById(packageId);

    if (!pkg && order && order.providerId) {
      try {
        const { providerFactory } = await import('../providers/provider-factory');
        const providerService = await providerFactory.getServiceById(order.providerId);
        const topupResults = await providerService.getTopupPackages(iccid);
        const topupAny = topupResults as any;
        const packages = Array.isArray(topupAny?.data) ? topupAny.data : Array.isArray(topupResults) ? topupResults : [];
        const selected = packages.find((p: any) =>
          String(p.id) === String(packageId) ||
          String(p.package_id) === String(packageId) ||
          String(p.providerPackageId) === String(packageId)
        );

        if (selected) {
          // Mock a package object with the price
          pkg = {
            id: packageId,
            retailPrice: selected.wholesalePrice || selected.net_price || selected.price || 0,
            // Add other fields if necessary to avoid type errors, but cast as any
          } as any;
        }
      } catch (err) {
        console.warn("Failed to lookup dynamic topup package", err);
      }
    }

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found',
      });
    }

    /* ---------------- Top-up Pricing ---------------- */
    const topupMarginSetting = await storage.getSettingByKey('topup_margin');
    const topupMargin = parseFloat(topupMarginSetting?.value || '40');

    let basePrice = pkg.retailPrice ? parseFloat(pkg.retailPrice.toString()) : 0;

    // Overwrite base price if a specific topupId is provided (dynamic top-up)
    if (topupId && order && order.providerId) {
      try {
        const { providerFactory } = await import('../providers/provider-factory');
        const providerService = await providerFactory.getServiceById(order.providerId);
        const topupResults = await providerService.getTopupPackages(iccid);
        const topupAny = topupResults as any;
        const packages = Array.isArray(topupAny?.data) ? topupAny.data : Array.isArray(topupResults) ? topupResults : [];
        const selected = packages.find((p: any) =>
          String(p.id) === String(topupId) ||
          String(p.package_id) === String(topupId) ||
          String(p.providerPackageId) === String(topupId)
        );

        if (selected) {
          basePrice = parseFloat((selected.wholesalePrice || selected.net_price || selected.price || 0).toString());
        }
      } catch (err) {
        console.warn("Failed to fetch dynamic topup price:", err);
      }
    }

    const totalAmount = parseFloat((basePrice * (1 + topupMargin / 100)).toFixed(2));

    /* ---------------- Gateway ---------------- */
    const [gateway] = await db
      .select()
      .from(paymentGateways)
      .where(eq(paymentGateways.id, gatewayId));

    if (!gateway || !gateway.isEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Selected payment gateway is disabled',
      });
    }

    let result: any;

    const payment = {
      provider: gateway.provider,
      clientSecret: null as string | null,
      paymentIntentId: null as string | null,
      orderId: null as string | null,
      redirectUrl: null as string | null,
      publicKey: null as string | null,
      guestAccessToken: null as string | null,
      amount: totalAmount,
      currency,
    };

    /* ---------------- Init Payment ---------------- */
    switch (gateway.provider) {
      /* -------- Stripe -------- */
      case 'stripe':
        result = await initStripePayment({
          secretKey: gateway.secretKey!,
          amount: totalAmount,
          currency,
          orderId,
          userId: req.userId,
          email,
          name,
          phone,
          metadata: {
            type: 'topup',
            packageId,
            iccid,
            orderId, // ensure metadata has orderId
            topupId: topupId || packageId, // standardize
            userId: req.userId?.toString(), // ensure userId
          },
        });

        payment.clientSecret = result.clientSecret;
        payment.paymentIntentId = result.paymentIntentId;
        payment.guestAccessToken = result.guestAccessToken ?? null;
        payment.publicKey = gateway.publicKey; // Return PK for frontend
        break;

      /* -------- Razorpay -------- */
      case 'razorpay':
        result = await initRazorpayPayment({
          keyId: gateway.publicKey!,
          secretKey: gateway.secretKey!,
          amount: totalAmount,
          currency,
          orderId,
          email,
          phone,
          userId: req.userId,
          notes: {
            type: 'topup',
            packageId,
            iccid,
          },
        });

        payment.orderId = result.orderId;
        payment.publicKey = result.keyId;
        payment.amount = Math.round(totalAmount * 100);
        break;

      /* -------- PayPal -------- */
      case 'paypal':
        result = await initPaypalPayment({
          clientId: gateway.publicKey!,
          secretKey: gateway.secretKey!,
          mode: (gateway.config as any)?.mode || 'sandbox',
          amount: totalAmount,
          currency,
          email,
          phone,
          userId: req.userId,
          metadata: {
            type: 'topup',
            packageId,
            iccid,
          },
        });

        payment.orderId = result.orderId;
        payment.publicKey = gateway.publicKey;
        (payment as any).mode = (gateway.config as any)?.mode || 'sandbox';
        break;

      /* -------- Paystack -------- */
      case 'paystack':
        if (!email) {
          return res.status(400).json({
            success: false,
            message: 'Email is required for Paystack payment',
          });
        }

        result = await initPaystackPayment({
          secretKey: gateway.secretKey!,
          email,
          amount: totalAmount,
          currency,
          // Pass the mobile callback URL when the request comes from Android WebView
          callbackUrl: callbackUrl || undefined,
          metadata: {
            type: 'topup',
            packageId,
            iccid,
            orderId,
            topupId: topupId || packageId,
            userId: req.userId?.toString(),
          },
        });

        payment.orderId = result.reference;
        payment.redirectUrl = result.authorizationUrl;
        payment.amount = Math.round(totalAmount * 100);
        break;

      /* -------- Flutterwave -------- */
      case 'flutterwave':
        if (!email) {
          return res.status(400).json({
            success: false,
            message: 'Email is required for Flutterwave payment',
          });
        }

        const topupBaseUrl = req.protocol + "://" + req.get("host");
        const topupRedirectUrl = req.body.redirectUrl || `${topupBaseUrl}/checkout`;

        result = await initFlutterwavePayment({
          secretKey: gateway.secretKey!,
          email,
          amount: totalAmount,
          currency,
          orderId: `${orderId}-topup-${Date.now()}`,
          name: name,
          phone: phone,
          redirectUrl: topupRedirectUrl,
          metadata: {
            type: 'topup',
            packageId,
            iccid,
            orderId,
            topupId: topupId || packageId,
            userId: req.userId?.toString(),
          },
        });

        payment.orderId = result.reference;
        payment.redirectUrl = result.authorizationUrl;
        payment.amount = totalAmount;
        break;

      case 'yookassa':
        if (!email) {
          return res.status(400).json({
            success: false,
            message: 'Email is required for YooKassa payment',
          });
        }

        const topupYookassaBaseUrl = req.protocol + "://" + req.get("host");
        const topupYookassaParams = new URLSearchParams({
          providerType: 'yookassa',
          orderId: orderId,
          purchaseType: 'topup',
        });
        const topupYookassaRedirectUrl = req.body.redirectUrl || `${topupYookassaBaseUrl}/order/processing?${topupYookassaParams.toString()}`;

        result = await initYookassaPayment({
          shopId: gateway.publicKey!,
          secretKey: gateway.secretKey!,
          amount: totalAmount,
          currency,
          orderId,
          redirectUrl: topupYookassaRedirectUrl,
          metadata: {
            type: 'topup_purchase',
            packageId,
            iccid,
            orderId,
            topupId: topupId || packageId,
            userId: req.userId?.toString(),
            existingOrderId: orderId,
          },
        });

        // Save the payment ID in the existing order record so `/confirm-payment` can find it
        await storage.updateOrder(order.id, {
          stripePaymentIntentId: result.reference,
        });

        payment.orderId = orderId;
        payment.redirectUrl = result.authorizationUrl;
        payment.amount = totalAmount;
        payment.currency = currency;
        payment.paymentIntentId = result.reference;
        break;


      case "powertranz":
        result = await initPowertranzSpiSale({
          merchantId: gateway.publicKey!,
          merchantPassword: gateway.secretKey!,
          amount: pricing.total,
          orderId,
          currency,
          email,
          name,
          // card: req.body.card, // 🔥 REQUIRED
          card: {
            pan: "4012000000020006",
            cvv: "323",
            expiry: "2310",
          },
        });

        payment.provider = "powertranz";
        payment.amount = pricing.total;
        payment.currency = currency;

        return res.json({
          success: true,
          message: "3DS authentication required",
          pricing,
          powertranz: {
            orderId,
            redirectData: result.redirectData, // 🔥 frontend iframe
            spiToken: result.spiToken,         // store client-side for confirm
          },
        });

      case 'midtrans':
        let topupMidtransAmount = Math.round(totalAmount);
        if (currency.toUpperCase() !== 'IDR') {
          const allCurrs = await storage.getCurrencies();
          const idrCurrency = allCurrs.find((c) => c.code.toUpperCase() === 'IDR');
          const idrRate = parseFloat(idrCurrency?.conversionRate || '18050');
          topupMidtransAmount = Math.round(totalAmount * idrRate);
        }

        result = await initMidtransPayment({
          serverKey: gateway.secretKey!,
          clientKey: gateway.publicKey || undefined,
          merchantId: (gateway.config as any)?.merchantId,
          mode: (gateway.config as any)?.mode || 'test',
          amount: topupMidtransAmount,
          currency: 'IDR',
          orderId: `${orderId}-topup-${Date.now()}`,
          name,
          phone,
          email,
          metadata: {
            type: 'topup',
            packageId,
            iccid,
            orderId,
            topupId: topupId || packageId,
            userId: req.userId?.toString(),
          },
        });

        payment.orderId = result.orderId;
        payment.redirectUrl = result.redirectUrl;
        payment.amount = totalAmount;
        payment.currency = currency;
        payment.publicKey = gateway.publicKey;
        (payment as any).token = result.token;
        (payment as any).mode = (gateway.config as any)?.mode || 'test';
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported payment provider',
        });
    }

    /* ---------------- Final Response ---------------- */
    return res.json({
      success: true,
      message: 'Top-up payment initialized successfully',
      pricing: {
        basePrice,
        margin: topupMargin,
        total: totalAmount,
        currency,
      },
      payment,
    });
  } catch (error: any) {
    console.error('Top-up payment init error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Top-up payment initialization failed',
    });
  }
});



router.post('/confirm-payments', async (req, res) => {
  try {
    const { provider } = req.body;

    if (!provider) {
      return res.status(400).json({
        success: false,
        message: 'provider is required',
      });
    }

    /* 🟢 Free Order Bypass */
    if (provider === 'free') {
      return res.json({
        success: true,
        provider: 'free',
        referenceId: `FREE_${Date.now()}`,
        amount: 0,
        currency: req.body.currency || 'USD',
        metadata: req.body.metadata || {},
      });
    }

    /* 🔐 Bypass Gateway fetch for IAP since it has custom verification */
    if (provider === 'iap-android') {
      const { purchaseToken, productId, packageName } = req.body.iap || {};
      if (!purchaseToken || !productId || !packageName) {
        return res.status(400).json({ success: false, message: 'Missing IAP Android required fields' });
      }

      const { verifyAndroidPurchaseWithGoogle } = await import('server/services/androidPurchase.service');
      let verifyResult: any;
      try {
        verifyResult = await verifyAndroidPurchaseWithGoogle({ packageName, productId, purchaseToken });
      } catch (verifyErr: any) {
        return res.status(400).json({ success: false, message: 'Android receipt verification failed: ' + verifyErr.message });
      }

      const transactionId = verifyResult.orderId || purchaseToken;

      return res.json({
        success: true,
        provider,
        referenceId: transactionId,
        amount: req.body.amount,
        currency: req.body.currency,
        // ✅ Structured metadata consumed by /api/confirm-payment → iap_purchase branch
        metadata: {
          type: 'iap_purchase',
          platform: 'android',
          packageId: req.body.packageId || req.body.metadata?.packageId,
          userId: req.body.userId || req.body.metadata?.userId,
          currency: req.body.currency || 'USD',
          transactionId,
          ...(req.body.metadata || {}),
        },
      });
    }

    if (provider === 'iap-ios') {
      const { receiptData } = req.body.iap || {};
      if (!receiptData) {
        return res.status(400).json({ success: false, message: 'Missing iOS receipt data' });
      }

      const { verifyAppleReceipt } = await import('server/services/applePurchase.service');
      let verifyResult: any;
      try {
        verifyResult = await verifyAppleReceipt(receiptData, false);
        if (verifyResult.status === 21007) {
          verifyResult = await verifyAppleReceipt(receiptData, true); // sandbox fallback
        }
      } catch (verifyErr: any) {
        return res.status(400).json({ success: false, message: 'iOS receipt verification failed: ' + verifyErr.message });
      }

      if (verifyResult.status !== 0) {
        return res.status(400).json({ success: false, message: 'Apple receipt verification failed. Status: ' + verifyResult.status });
      }

      const latestReceipt = verifyResult.latest_receipt_info?.[0];
      const transactionId = latestReceipt?.transaction_id || ('ios-receipt-' + Date.now());

      return res.json({
        success: true,
        provider,
        referenceId: transactionId,
        amount: req.body.amount,
        currency: req.body.currency,
        // ✅ Structured metadata consumed by /api/confirm-payment → iap_purchase branch
        metadata: {
          type: 'iap_purchase',
          platform: 'ios',
          packageId: req.body.packageId || req.body.metadata?.packageId,
          userId: req.body.userId || req.body.metadata?.userId,
          currency: req.body.currency || 'USD',
          transactionId,
          ...(req.body.metadata || {}),
        },
      });
    }

    /* 🔐 Fetch ACTIVE gateway by provider name */
    const [gateway] = await db
      .select()
      .from(paymentGateways)
      .where(eq(paymentGateways.provider, provider));

    if (!gateway || !gateway.isEnabled) {
      return res.status(400).json({
        success: false,
        message: `${provider} payment gateway is disabled`,
      });
    }

    let verificationResult;

    switch (provider) {
      case 'razorpay':
        verificationResult = await verifyRazorpay(req.body, gateway);
        break;

      case 'stripe':
        verificationResult = await verifyStripe(req.body, gateway);
        break;

      case 'paypal':
        verificationResult = await verifyPaypal(req.body, gateway);
        break;

      case 'paystack':
        verificationResult = await verifyPaystack(req.body, gateway);
        break;

      case 'flutterwave':
        verificationResult = await verifyFlutterwave(req.body, gateway);
        break;

      case 'yookassa':
        verificationResult = await verifyYookassa(req.body, gateway);
        break;

      case "powertranz":
        verificationResult = await confirmPowertranzPayment(req.body);
        break;

      case 'midtrans':
        verificationResult = await verifyMidtrans(req.body, gateway);
        break;

      case 'iap-android':
      case 'iap-ios':
        throw new Error("IAP verification should be handled natively before gateway lookup.");

      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported payment provider',
        });
    }

    if (!verificationResult?.success) {
      return res.status(400).json(verificationResult);
    }

    return res.json({
      success: true,
      provider,
      ...verificationResult,
    });
  } catch (err: any) {
    console.error('Confirm payment error:', err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});



/**
 * Initialize Gift Card Payment
 * Handles payment initialization exclusively for gift card purchases
 */
router.post('/init-gift-card', optionalAuth, async (req, res) => {
  try {
    const {
      gatewayId,
      amount,
      currency,
      recipientEmail,
      recipientName,
      message,
      email,
      name,
      phone,
      paymentMethod = 'spi',
      card,
    } = req.body;

    // 🔍 Validate if req.userId belongs to a real user (not an admin)
    const user = req.userId ? await storage.getUserById(req.userId) : null;
    if (!user) {
      req.userId = undefined;
    }

    const guestAccessToken = req.userId ? null : crypto.randomUUID();

    // Gift card purchases don't need a unique order_id from the frontend, but gateways still want one.
    const orderId = `gc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;


    /* ---------------- Validation ---------------- */
    if (!currency || !amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount and currency are required',
      });
    }

    if (!req.userId && !email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required for guest checkout',
      });
    }

    /* ---------------- Pricing ---------------- */
    const pricing = {
      total: Number(amount),
      subtotal: Number(amount),
      discount: 0,
      amount: Number(amount)
    };


    /* ---------------- Gateway Validation ---------------- */
    const [gateway] = await db
      .select()
      .from(paymentGateways)
      .where(eq(paymentGateways.id, gatewayId));

    if (!gateway || !gateway.isEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Selected payment gateway is disabled',
      });
    }

    let result: any;

    const payment = {
      provider: gateway.provider,
      clientSecret: null as string | null,
      paymentIntentId: null as string | null,
      orderId: null as string | null,
      redirectUrl: null as string | null,
      publicKey: null as string | null,
      guestAccessToken: guestAccessToken,
      amount: pricing.total,
      currency: currency,
      paymentMethod: null as string | null,
      purchaseType: 'giftcard'
    };

    /* ========================
       PAYMENT GATEWAY ROUTING
       ======================== */

    switch (gateway.provider) {
      case 'stripe':
        result = await initStripePayment({
          secretKey: gateway.secretKey!,
          amount: pricing.total,
          currency,
          packageId: 'gift_card',
          quantity: 1,
          orderId,
          userId: req.userId,
          email,
          name,
          phone,
          metadata: {
            type: 'gift_card',
            userId: req.userId?.toString() || '',
            amount: String(amount),
            recipientEmail: recipientEmail || '',
            recipientName: recipientName || '',
            message: message || '',
            currency: currency || 'USD',
          },
        });

        payment.clientSecret = result.clientSecret;
        payment.publicKey = gateway.publicKey!;
        payment.paymentIntentId = result.paymentIntentId;
        payment.guestAccessToken = result.guestAccessToken ?? null;
        payment.amount = pricing.total;
        payment.currency = currency;
        break;

      case 'razorpay':
        result = await initRazorpayPayment({
          keyId: gateway.publicKey!,
          secretKey: gateway.secretKey!,
          amount: pricing.total,
          currency,
          orderId,
          packageId: 'gift_card',
          quantity: 1,
          email: email || undefined,
          phone,
          guestAccessToken: payment.guestAccessToken,
          userId: req.userId,
          metadata: {
            type: 'gift_card',
            amount: String(amount),
            recipientEmail: recipientEmail || '',
            recipientName: recipientName || '',
            message: message || '',
            currency: currency || 'USD',
            userId: req.userId || '',
          }
        });

        payment.orderId = result.orderId;
        payment.publicKey = result.keyId;
        payment.amount = Math.round(pricing.total * 100);
        payment.currency = currency;
        break;

      case 'paypal':
        result = await initPaypalPayment({
          clientId: gateway.publicKey!,
          secretKey: gateway.secretKey!,
          mode: (gateway.config as any)?.mode || 'sandbox',
          amount: pricing.total,
          currency,
          packageId: 'gift_card',
          quantity: 1,
          email: email || undefined,
          phone: phone,
          guestAccessToken: payment.guestAccessToken,
          userId: req.userId,
          metadata: {
            type: 'gift_card',
            amount: String(amount),
            recipientEmail: recipientEmail || '',
            recipientName: recipientName || '',
            message: message || '',
            currency: currency || 'USD',
            userId: req.userId || '',
          }
        });

        payment.orderId = result.orderId;
        payment.amount = pricing.total;
        payment.currency = currency;

        payment.publicKey = gateway.publicKey;
        (payment as any).mode = (gateway.config as any)?.mode || 'sandbox';
        break;

      case 'paystack':
        if (!email) {
          return res.status(400).json({
            success: false,
            message: 'Email is required for Paystack payment',
          });
        }

        result = await initPaystackPayment({
          secretKey: gateway.secretKey!,
          email,
          amount: pricing.total,
          currency,
          metadata: {
            type: 'gift_card',
            amount: String(amount),
            recipientEmail: recipientEmail || '',
            recipientName: recipientName || '',
            message: message || '',
            currency: currency || 'USD',
            userId: req.userId || '',
          }
        });

        payment.orderId = result.reference;
        payment.redirectUrl = result.authorizationUrl;
        payment.amount = Math.round(pricing.total * 100);
        payment.currency = currency;
        break;

      case 'yookassa':
        if (!email) {
          return res.status(400).json({
            success: false,
            message: 'Email is required for YooKassa payment',
          });
        }

        const giftYookassaBaseUrl = req.protocol + "://" + req.get("host");
        const giftYookassaParams = new URLSearchParams({
          providerType: 'yookassa',
          orderId: orderId,
          purchaseType: 'giftcard',
        });
        if (payment.guestAccessToken) {
          giftYookassaParams.set('guestAccessToken', payment.guestAccessToken);
        }
        const giftYookassaRedirectUrl = req.body.redirectUrl || `${giftYookassaBaseUrl}/order/processing?${giftYookassaParams.toString()}`;

        result = await initYookassaPayment({
          shopId: gateway.publicKey!,
          secretKey: gateway.secretKey!,
          amount: pricing.total,
          currency,
          orderId: orderId,
          redirectUrl: giftYookassaRedirectUrl,
          metadata: {
            type: 'gift_card',
            amount: String(amount),
            recipientEmail: recipientEmail || '',
            recipientName: recipientName || '',
            message: message || '',
            currency: currency || 'USD',
            userId: req.userId || '',
            existingOrderId: orderId,
          },
        });

        const existingGiftOrder = await storage.getOrderById(orderId);
        if (existingGiftOrder) {
          await storage.updateOrder(orderId, {
            status: 'pending',
            price: pricing.total.toString(),
            stripePaymentIntentId: result.reference,
            transactionId: result.reference,
            guestEmail: email || null,
            guestPhone: phone || null,
            guestAccessToken: payment.guestAccessToken || null,
          });
        } else {
          await storage.createOrder({
            id: orderId,
            userId: req.userId || null,
            packageId: 'gift_card',
            orderType: 'single',
            quantity: 1,
            status: 'pending',
            price: pricing.total.toString(),
            currency: currency,
            orderCurrency: currency,
            dataAmount: '0',
            validity: 0,
            installationSent: false,
            stripePaymentIntentId: result.reference,
            paymentMethod: 'card',
            transactionId: result.reference,
            guestEmail: email || null,
            guestPhone: phone || null,
            guestAccessToken: payment.guestAccessToken || null,
          });
        }

        payment.orderId = orderId;
        payment.redirectUrl = result.authorizationUrl;
        payment.amount = pricing.total;
        payment.currency = currency;
        payment.paymentIntentId = result.reference;
        break;

      /* ========================
         POWERTRANZ INTEGRATION
         ======================== */

      case 'powertranz':
        if (paymentMethod === 'hpp') {
          // ========================
          // HPP METHOD (HOSTED PAGE)
          // ========================
          console.log('🎯 Initializing PowerTranz HPP (Hosted Payment Page)');

          result = await initPowertranzHpp({
            merchantId: gateway.publicKey!,
            merchantPassword: gateway.secretKey!,
            amount: pricing.total,
            orderId,
            currency,
            email,
            name,
            phone,
          });

          console.log('✅ PowerTranz HPP initialized:', {
            hasRedirectUrl: !!result.redirectUrl,
            hppToken: result.hppToken?.substring(0, 20) + '...',
          });

          // Return HPP redirect response
          return res.json({
            success: true,
            message: 'HPP payment page initialized',
            pricing,
            powertranz: {
              method: 'hpp',
              redirectUrl: result.redirectUrl, // Frontend redirects user to this URL
              hppToken: result.hppToken,
            },
            payment: {
              provider: 'powertranz',
              paymentMethod: 'hpp',
              guestAccessToken,
              amount: pricing.total,
              currency,
              orderId,
            },
          });

        } else {
          // ========================
          // SPI METHOD (3DS IFRAME)
          // ========================
          // 🔥 Validate card data is provided for SPI
          if (!card || !card.pan || !card.cvv || !card.expiry) {
            return res.status(400).json({
              success: false,
              message: 'Card details are required for PowerTranz SPI payment',
            });
          }

          console.log('🔥 Initializing PowerTranz SPI (3DS Challenge)');

          result = await initPowertranzSpiSale({
            merchantId: gateway.publicKey!,
            merchantPassword: gateway.secretKey!,
            amount: pricing.total,
            orderId,
            currency,
            email,
            name,
            card,
          });

          console.log('✅ PowerTranz SPI Response:', {
            Approved: result.Approved,
            IsoResponseCode: result.IsoResponseCode,
            hasSpiToken: !!result.spiToken,
            hasRedirectData: !!result.redirectData,
          });

          // Return 3DS data for frontend iframe
          return res.json({
            success: true,
            message: '3DS authentication required',
            pricing,
            powertranz: {
              method: 'spi',
              orderId,
              redirectData: result.redirectData, // HTML for iframe
              spiToken: result.spiToken, // Store for confirmation
            },
            payment: {
              provider: 'powertranz',
              paymentMethod: 'spi',
              guestAccessToken,
              amount: pricing.total,
              currency,
            },
          });
        }

      case 'midtrans':
        let giftMidtransAmount = Math.round(pricing.total);
        if (currency.toUpperCase() !== 'IDR') {
          const allCurrs = await storage.getCurrencies();
          const idrCurrency = allCurrs.find((c) => c.code.toUpperCase() === 'IDR');
          const idrRate = parseFloat(idrCurrency?.conversionRate || '18050');
          giftMidtransAmount = Math.round(pricing.total * idrRate);
        }

        result = await initMidtransPayment({
          serverKey: gateway.secretKey!,
          clientKey: gateway.publicKey || undefined,
          merchantId: (gateway.config as any)?.merchantId,
          mode: (gateway.config as any)?.mode || 'test',
          amount: giftMidtransAmount,
          currency: 'IDR',
          orderId,
          email,
          name,
          phone,
          metadata: {
            type: 'gift_card',
            amount: String(amount),
            recipientEmail: recipientEmail || '',
            recipientName: recipientName || '',
            message: message || '',
            currency: currency || 'USD',
            userId: req.userId || '',
          },
        });

        const existingGiftOrderMidtrans = await storage.getOrderById(orderId);
        if (existingGiftOrderMidtrans) {
          await storage.updateOrder(orderId, {
            status: 'pending',
            price: pricing.total.toString(),
            stripePaymentIntentId: result.token,
            transactionId: result.token,
            guestEmail: email || null,
            guestPhone: phone || null,
            guestAccessToken: payment.guestAccessToken || null,
          });
        } else {
          await storage.createOrder({
            id: orderId,
            userId: req.userId || null,
            packageId: 'gift_card',
            orderType: 'single',
            quantity: 1,
            status: 'pending',
            price: pricing.total.toString(),
            currency: currency,
            orderCurrency: currency,
            dataAmount: '0',
            validity: 0,
            installationSent: false,
            stripePaymentIntentId: result.token,
            paymentMethod: 'midtrans',
            transactionId: result.token,
            guestEmail: email || null,
            guestPhone: phone || null,
            guestAccessToken: payment.guestAccessToken || null,
          });
        }

        payment.orderId = orderId;
        payment.redirectUrl = result.redirectUrl;
        payment.amount = pricing.total;
        payment.currency = currency;
        payment.publicKey = gateway.publicKey;
        (payment as any).token = result.token;
        (payment as any).mode = (gateway.config as any)?.mode || 'test';
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported payment provider',
        });
    }

    /* ========================
       FINAL RESPONSE (non-PowerTranz)
       ======================== */
    return res.json({
      success: true,
      message: 'Payment initialized successfully',
      pricing,
      payment,
    });

  } catch (error: any) {
    console.error('Gift Card Payment init error:', error);

    return res.status(500).json({
      success: false,
      message: error?.message || error?.error || 'Payment initialization failed',
    });
  }
});

/**
 * Midtrans Webhook / HTTP Notification Handler
 * Configured in Midtrans Merchant Administration Portal (MAP) -> Configuration -> Payment Notification URL
 */
router.post('/midtrans/notification', async (req, res) => {
  try {
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
      transaction_id,
    } = req.body;

    if (!order_id || !signature_key) {
      return res.status(400).json({ success: false, message: 'Missing required notification fields' });
    }

    const [gateway] = await db
      .select()
      .from(paymentGateways)
      .where(eq(paymentGateways.provider, 'midtrans'));

    if (!gateway || !gateway.secretKey) {
      return res.status(400).json({ success: false, message: 'Midtrans gateway not configured' });
    }

    // Verify SHA-512 signature: SHA512(order_id + status_code + gross_amount + ServerKey)
    const payloadString = `${order_id}${status_code}${gross_amount}${gateway.secretKey.trim()}`;
    const expectedSignature = crypto.createHash('sha512').update(payloadString).digest('hex');

    if (signature_key.toLowerCase() !== expectedSignature.toLowerCase()) {
      console.warn('⚠️ Invalid Midtrans webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    console.log(`📨 Midtrans notification for order ${order_id}: status=${transaction_status}, fraud=${fraud_status}`);

    const isSuccess =
      transaction_status === 'settlement' ||
      (transaction_status === 'capture' && fraud_status === 'accept');

    if (isSuccess) {
      const order = await storage.getOrderById(order_id);
      if (order && order.status !== 'completed' && order.status !== 'processing') {
        const axios = (await import('axios')).default;
        const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5001}`;
        const confirmUrl = order.userId ? `${BASE}/api/confirm-payment` : `${BASE}/api/guest/confirm-payment`;
        try {
          await axios.post(confirmUrl, {
            providerType: 'midtrans',
            orderId: order_id,
            transactionId: transaction_id || order_id,
            statusCode: status_code,
            transactionStatus: transaction_status,
            guestAccessToken: order.guestAccessToken || undefined,
            metadata: {
              existingOrderId: order_id,
              orderId: order_id,
            },
          });
          console.log(`✅ Order ${order_id} confirmed via Midtrans webhook`);
        } catch (err: any) {
          console.error(`❌ Failed to auto-confirm order ${order_id} via Midtrans webhook:`, err.response?.data || err.message);
        }
      }
    } else if (transaction_status === 'cancel' || transaction_status === 'expire' || transaction_status === 'deny') {
      const order = await storage.getOrderById(order_id);
      if (order && order.status === 'pending') {
        await storage.updateOrder(order_id, { status: 'failed' });
      }
    }

    return res.status(200).json({ success: true, message: 'Notification received' });
  } catch (err: any) {
    console.error('Midtrans notification error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
