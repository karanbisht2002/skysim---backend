import dotenv from "dotenv";
dotenv.config();
import type { Express, Request, Response, NextFunction } from 'express';
import { createServer, type Server } from 'http';
import session from 'express-session';
import * as ApiResponse from './utils/response';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import { storage } from './storage';
import { db } from './db';
import {
  orders,
  topups,
  providers,
  unifiedPackages,
  reviews,
  users,
  insertReviewSchema,
  referralProgram,
  referrals,
  referralSettings,
  referralTransactions,
  insertReferralProgramSchema,
  insertReferralSchema,
  insertReferralSettingsSchema,
  blogPosts,
  airaloTopups,
  esimAccessTopups,
  esimGoPackages,
  esimGoTopups,
  mayaTopups,
  destinations,
  regions,
  giftCards,
  notifications,
  customNotifications,
  apiKeys,
  activityLogs,
  insertCurrencyRateSchema,
} from '@shared/schema';
import { eq, and, sql, or, ilike, gte, lte, asc, desc, isNull, count, ne, gt } from 'drizzle-orm';
import { airaloAPI } from './services/airalo/airalo-sdk';
import {
  sendEmail,
  resetTransporter,
  generateOTPEmail,
  generateWelcomeEmail,
  generateOrderConfirmationEmail,
  generateInstallationEmail,
  generateLowDataEmail,
  generateCustomNotificationEmail,
  generateGiftCardEmail,
} from './email';
import { airaloSyncService } from './services/airalo/airalo-sync';
import { airaloOrderService, type AiraloWebhookPayload } from './services/airalo/airalo-order';
import { airaloNotificationService } from './services/airalo/airalo-notifications';
import { insertPageSchema, insertEmailTemplateSchema } from '@shared/schema';
import bcrypt from 'bcrypt';
import { createMultiUploader } from './utils/upload';
import { generateToken, verifyToken } from './utils/auth';
import { providerFactory } from './providers';
import authRouter from './routes/auth';
import destinationsRouter from './routes/destinations';
import regionsRouter from './routes/regions';
import packagesRouter from './routes/packages';
import unifiedPackagesRouter from './routes/unifiedPackages';
import ordersRouter from './routes/orders';
import ticketsRouter from './routes/tickets';
import tickets from './routes/tickets';
import notificationsRouter from './routes/notifications';
import customerRouter from './routes/customer';
import contactRouter from './routes/contact';
import apiV1Router from './routes/api-v1';
import pagesRouter from './routes/admin/pages';
import faqsRouter from './routes/admin/faqs';
import PaymentsRouter from './routes/payments';
import IapRouter from './routes/iap';
import { asyncHandler } from './lib/asyncHandler';
import { ValidationError, NotFoundError } from './lib/errors';
import { requireAuth } from './lib/middleware';
import adminRoutes from './routes/admin/index';
import bannerRouter from './routes/banner.routes';
import privacyPolicyRoutes from './routes/admin/PrivacyPolicy';
import { getAdminMessaging } from './config/firebase-admin';
import axios from 'axios';
import { optionalAdminAuth } from './middleware/auth';
import { demoCrudBlock } from './utils/demoCrudBlock';
import { demoMaskResponse } from './utils/demoMaskResponse';
import supportedDevices from "./lib/devices.json";
import QRCode from "qrcode";


// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover',
});

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    adminId?: string;
  }
}

// File upload configuration
const uploadDir = path.join(process.cwd(), 'uploads', 'kyc');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateAndSaveQrCode(
  lpaCode: string,
  orderId: string | number,
): Promise<string | null> {
  try {
    // ── 1. Folder path: <project_root>/uploads/qrcodes/ ─────────────────
    const qrDir = path.join(__dirname, '..', 'uploads', 'qrcodes');

    if (!fs.existsSync(qrDir)) {
      fs.mkdirSync(qrDir, { recursive: true });
      console.log('📁 Created folder:', qrDir);
    }

    // ── 2. Unique filename ───────────────────────────────────────────────
    const filename = `qr_order_${orderId}_${Date.now()}.png`;
    const filePath = path.join(qrDir, filename);

    // ── 3. Save PNG to disk ──────────────────────────────────────────────
    await QRCode.toFile(filePath, lpaCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 300,
      type: 'png',
    });

    console.log(`✅ QR code saved at: ${filePath}`);

    // ── 4. Return public URL ─────────────────────────────────────────────
    const baseUrl = (process.env.BASE_URL || 'https://esimconnect.diploy.in').replace(/\/$/, '');
    const publicUrl = `${baseUrl}/uploads/qrcodes/${filename}`;

    console.log(`🔗 QR public URL: ${publicUrl}`);
    return publicUrl;

  } catch (err) {
    console.error('❌ QR code save failed:', err);
    return null;
  }
}

function generateOTP(): string {
  // In development mode, use a fixed OTP for testing
  if (process.env.NODE_ENV === 'development') {
    return '123456';
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper function to award referral credits when a referred user completes a purchase
async function awardReferralCredits(userId: string, orderId: string, orderAmount: number) {
  try {
    // Check if referral program is enabled
    const settings = await db.select().from(referralSettings).limit(1);
    if (!settings[0] || !settings[0].enabled) {
      console.log('[Referral] Program is disabled, skipping credit award');
      return;
    }

    // Check minimum order amount
    const minOrderAmount = parseFloat(settings[0].minOrderAmount.toString());
    if (orderAmount < minOrderAmount) {
      console.log(`[Referral] Order amount ${orderAmount} below minimum ${minOrderAmount}`);
      return;
    }

    // Find if this user was referred by someone (pending referral)
    const pendingReferral = await db
      .select()
      .from(referrals)
      .where(and(eq(referrals.referredId, userId), eq(referrals.status, 'pending')))
      .limit(1);

    if (pendingReferral.length === 0) {
      console.log('[Referral] No pending referral found for user');
      return;
    }

    const referral = pendingReferral[0];
    const referrerId = referral.referrerId;

    // Calculate reward amount
    let rewardAmount = 0;
    if (settings[0].rewardType === 'percentage') {
      rewardAmount = (orderAmount * parseFloat(settings[0].rewardValue.toString())) / 100;
    } else {
      rewardAmount = parseFloat(settings[0].rewardValue.toString());
    }

    rewardAmount = Math.round(rewardAmount * 100) / 100;

    // Get referrer's current balance
    const referrer = await db
      .select({ referralBalance: users.referralBalance })
      .from(users)
      .where(eq(users.id, referrerId))
      .limit(1);

    if (!referrer[0]) {
      console.log(`[Referral] Referrer ${referrerId} not found`);
      return;
    }

    const currentBalance = parseFloat(referrer[0].referralBalance?.toString() || '0');
    const newBalance = currentBalance + rewardAmount;

    // Update referrer's balance
    await db
      .update(users)
      .set({
        referralBalance: newBalance.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(users.id, referrerId));

    // Create transaction record
    await db.insert(referralTransactions).values({
      userId: referrerId,
      type: 'credit_earned',
      amount: rewardAmount.toFixed(2),
      balanceBefore: currentBalance.toFixed(2),
      balanceAfter: newBalance.toFixed(2),
      referralId: referral.id,
      orderId: orderId,
      description: `Earned ${rewardAmount.toFixed(2)} credits from referral`,
    });

    // Update referral status to completed
    await db
      .update(referrals)
      .set({
        status: 'completed',
        rewardAmount: rewardAmount.toFixed(2),
        rewardPaid: true,
        referredOrderId: orderId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(referrals.id, referral.id));

    // Update referrer's program stats
    await db
      .update(referralProgram)
      .set({
        totalReferrals: sql`${referralProgram.totalReferrals} + 1`,
        totalEarnings: sql`${referralProgram.totalEarnings} + ${rewardAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(referralProgram.userId, referrerId));

    // Create notification for referrer
    await storage.createNotification({
      userId: referrerId,
      type: 'referral',
      title: 'Referral Reward Earned!',
      message: `You earned $${rewardAmount.toFixed(2)} in credits from a successful referral!`,
      read: false,
      metadata: { referralId: referral.id, orderId, rewardAmount },
    });

    console.log(
      `[Referral] Awarded ${rewardAmount} credits to referrer ${referrerId} for order ${orderId}`,
    );
  } catch (error: any) {
    console.error('[Referral] Error awarding credits:', error.message);
  }
}

export async function logAdminActivity(
  req: Request,
  action: string,
  entity: string,
  entityId: string | null = null,
  adminIdOverride: string | null = null,
  metadata: any = {}
) {
  try {
    const adminId = adminIdOverride || (req.session as any)?.adminId || (req as any).admin?.id;
    if (!adminId) return;

    await db.insert(activityLogs).values({
      adminId,
      action,
      entity,
      entityId,
      metadata,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
    });
  } catch (error) {
    console.error('Failed to log admin activity:', error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required for security');
  }
  // check
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    }),
  );

  // console.log("optionalAdminAuth")
  app.use(optionalAdminAuth);      // sets req.user
  app.use('/api', demoCrudBlock);
  app.use('/api', demoMaskResponse);


  // Authentication middleware
  const requireAuthh = (req: any, res: Response, next: Function) => {
    if (req.session?.userId || req.session?.adminId) {
      req.userId = req.session.userId;
      req.adminId = req.session.adminId;
      req.role = req.session.role;
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    try {
      const token = authHeader.split(' ')[1];
      const decoded: any = verifyToken(token);

      req.userId = decoded.id;
      req.role = decoded.role;
      next();
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  };

  const requireAdmin = (req: Request, res: Response, next: Function) => {
    if (!req.session.adminId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
  };

  // ==================== WEBHOOK ROUTES ====================

  /**
   * Generic provider webhook handler
   * Routes: /api/webhooks/:provider_slug/:event_type
   * Examples:
   *   - /api/webhooks/airalo/order-complete
   *   - /api/webhooks/esim-access/order-status
   *   - /api/webhooks/esim-go/low-data
   */

  app.get('/api/test-auth', async (req, res) => {
    try {
      const token = await airaloAPI.authenticate();
      ApiResponse.success(res, 'Authentication successful', { token });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post(
    '/api/upload',
    createMultiUploader('setting', [{ name: 'image', maxCount: 1 }]),
    async (req, res) => {
      try {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        if (!files || !files.image || files.image.length === 0) {
          return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const file = files.image[0];
        const fileUrl = `/uploads/setting/${file.filename}`;

        res.json({ success: true, message: 'File uploaded successfully', data: { fileUrl } });
      } catch (error: any) {
        console.error('File upload error:', error);
        res.status(500).json({ success: false, message: 'File upload failed: ' + error.message });
      }
    },
  );

  app.get('/sims', async (req, res) => {
    try {
      const params = req.query;
      const simsList = await airaloAPI.getSimsList(params);
      res.json({ success: true, message: 'SIMs fetched successfully', data: simsList });
    } catch (error: any) {
      console.error('Error fetching SIMs list:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/devices', async (req, res) => {

    try {
      const devices = await airaloAPI.getDevices();
      return res.json({
        success: true,
        source: "airalo",
        data: devices?.data,
      });
    } catch (error: any) {
      console.error("Airalo failed, using local JSON:", error.message);

      return res.json({
        success: true,
        source: "local",
        data: supportedDevices,
      });
    }
  });


  app.get('/api/countries', async (req, res) => {
    try {
      const packagesResponse = await airaloAPI.getPackages();

      const countriesMap: Record<string, any> = {};
      packagesResponse.data.forEach((item: any) => {
        if (!countriesMap[item.country_code]) {
          countriesMap[item.country_code] = {
            country_name: item.title,
            country_code: item.country_code,
          };
        }
      });

      const countries = Object.values(countriesMap);
      res.json({ success: true, message: 'Countries fetched successfully', data: { countries } });
    } catch (error: any) {
      console.error('Error fetching countries:', error.message);
      res.status(500).json({ success: false, message: 'Failed to fetch countries' });
    }
  });

  app.get('/api/packages', async (req, res) => {
    try {
      const packages = await airaloAPI.getPackages(req.query);
      res.json({ success: true, message: 'Packages fetched successfully', data: packages });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/webhooks/:provider_slug/:event_type', async (req: Request, res: Response) => {
    try {
      const { provider_slug, event_type } = req.params;
      const signature =
        (req.headers['x-webhook-signature'] as string) ||
        (req.headers['airalo-signature'] as string); // Support Airalo header
      const payload = req.body;

      console.log(`📨 Webhook received from ${provider_slug}: ${event_type}`);

      // Get provider from database
      const provider = await db.query.providers.findFirst({
        where: eq(providers.slug, provider_slug),
      });

      if (!provider) {
        console.error(`❌ Unknown provider: ${provider_slug}`);
        return res.status(404).json({ success: false, message: 'Provider not found' });
      }

      // Get provider service using ProviderFactory
      const { providerFactory } = await import('./providers/provider-factory');
      const providerService = await providerFactory.getServiceBySlug(provider_slug);

      // Validate webhook signature
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const validation = await providerService.validateWebhook(payloadString, signature);

      if (!validation.isValid) {
        console.warn(`⚠️ Invalid webhook signature from ${provider_slug}: ${validation.reason}`);

        // Log webhook validation error
        const { providerErrorHandler } = await import('./providers/provider-error-handler');
        await providerErrorHandler.logError({
          providerId: provider.id,
          providerName: provider.name,
          errorType: 'webhook_validation',
          errorMessage: validation.reason || 'Invalid webhook signature',
          errorDetails: {
            event_type,
            hasSignature: !!signature,
            bodyType: typeof payload,
          },
          timestamp: new Date(),
        });

        return res.status(200).json({ success: true, message: 'Webhook received' }); // Return 200 to prevent retries
      }

      // Parse webhook payload to standard format
      const normalizedPayload = await providerService.parseWebhookPayload(payload);

      console.log(`   Webhook type: ${normalizedPayload.type}`);

      // Route based on webhook type
      if (normalizedPayload.type === 'order_status') {
        // Handle order status update - support both requestId and providerOrderId lookups
        let batchOrders: any[] = [];

        if (normalizedPayload.requestId) {
          // Primary lookup: by requestId (supports batch orders)
          batchOrders = await storage.getOrdersByRequestId(normalizedPayload.requestId);
        } else if (normalizedPayload.providerOrderId) {
          // Fallback lookup: by providerOrderId + providerId
          const order = await db.query.orders.findFirst({
            where: and(
              eq(orders.providerOrderId, normalizedPayload.providerOrderId),
              eq(orders.providerId, provider.id),
            ),
          });
          if (order) {
            batchOrders = [order];
          }
        }

        if (batchOrders.length === 0) {
          console.error(
            `❌ No orders found for webhook (requestId: ${normalizedPayload.requestId}, providerOrderId: ${normalizedPayload.providerOrderId})`,
          );
          return res
            .status(200)
            .json({ success: true, message: 'Webhook received - no orders found' });
        }

        // Update all orders with this requestId
        for (const order of batchOrders) {
          if (normalizedPayload.status === 'completed' && normalizedPayload.iccid) {
            // Order succeeded
            await storage.updateOrder(order.id, {
              status: 'completed',
              iccid: normalizedPayload.iccid,
              qrCode: (normalizedPayload.data?.qrCode as string) || null,
              smdpAddress: (normalizedPayload.data?.smdpAddress as string) || null,
              activationCode: (normalizedPayload.data?.activationCode as string) || null,
              webhookReceivedAt: new Date(),
            });

            // Create success notification
            if (order.userId) {
              await storage.createNotification({
                userId: order.userId,
                type: 'purchase',
                title: 'eSIM Ready!',
                message: `Your eSIM order ${order.displayOrderId} is ready to activate`,
              });
            }
          } else if (normalizedPayload.status === 'failed') {
            // Order failed
            await storage.updateOrder(order.id, {
              status: 'failed',
              webhookReceivedAt: new Date(),
            });

            // Create failure notification
            if (order.userId) {
              await storage.createNotification({
                userId: order.userId,
                type: 'purchase',
                title: 'Order Failed',
                message: `Unfortunately, order ${order.displayOrderId} could not be processed. Please contact support for a refund.`,
              });
            }
          }
        }

        console.log(
          `✅ Webhook processed: ${batchOrders.length} orders updated (${provider_slug})`,
        );
        return ApiResponse.success(res, 'Webhook processed successfully', {
          ordersUpdated: batchOrders.length,
        });
      } else if (normalizedPayload.type === 'low_data' && normalizedPayload.iccid) {
        // Handle low data notification
        const order = await storage.getOrderByIccid(normalizedPayload.iccid);

        if (!order) {
          console.warn(`⚠️ Order not found for ICCID: ${normalizedPayload.iccid}`);
          return res
            .status(200)
            .json({ success: true, message: 'Webhook received - order not found' });
        }

        // Get notification settings (keys like 'notif_low_data_75', 'notif_low_data_90', etc.)
        const notifSettings = await storage.getNotificationSettings();
        const threshold = normalizedPayload.data?.threshold as string;

        // Map threshold to the actual setting key stored in database
        const settingKeyMap: Record<string, string> = {
          '75_percent': 'notif_low_data_75',
          '90_percent': 'notif_low_data_90',
          '3_days': 'notif_expiring_3days',
          '1_day': 'notif_expiring_1day',
        };
        const settingKey = settingKeyMap[threshold];
        const isEnabled = settingKey ? notifSettings[settingKey] !== false : true;

        if (isEnabled && order.userId) {
          const user = await storage.getUserById(order.userId);
          const pkg = order.packageId ? await storage.getPackageById(order.packageId) : null;
          const packageName = pkg?.title || order.packageTitle || 'Unknown';

          if (user?.email) {
            const emailData = await generateLowDataEmail({
              userName: user.name || user.email,
              threshold: threshold,
              remainingData: (normalizedPayload.data?.dataRemaining as string) || 'Unknown',
              totalData: (normalizedPayload.data?.totalData as string) || 'Unknown',
              packageName: packageName,
              iccid: order.iccid || 'N/A',
              expiryDate: normalizedPayload.data?.expiryDate as string,
              topupUrl: `https://${process.env.BASE_URL}/esims/${order.id}`,
            });

            await sendEmail({
              to: user.email,
              subject: emailData.subject,
              html: emailData.html,
            });
          }

          await storage.createNotification({
            userId: order.userId,
            type: 'expiring',
            title: 'Low Data Alert',
            message: `Your eSIM for ${packageName} is running low on data. Consider purchasing a top-up.`,
          });
        }

        console.log(
          `✅ Low data notification processed for ${normalizedPayload.iccid} (${provider_slug})`,
        );
        return res.status(200).json({ success: true, message: 'Notification processed' });
      }

      // Unknown webhook type
      console.warn(`⚠️ Unknown webhook type: ${normalizedPayload.type} from ${provider_slug}`);
      return res.status(200).json({ success: true, message: 'Webhook received - unknown type' });
    } catch (error: any) {
      console.error('❌ Generic webhook error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==============================================
  // LEGACY AIRALO WEBHOOKS (Backwards Compatibility)
  // ==============================================

  // Airalo webhook for async order completion
  app.post('/api/webhooks/airalo/order-complete', async (req: Request, res: Response) => {
    try {
      const payload: AiraloWebhookPayload = req.body;
      console.log('📨 Airalo webhook received:', payload.request_id);

      // Validate webhook (optional - implement signature verification if Airalo provides it)
      if (!airaloOrderService.validateWebhookSignature(payload)) {
        console.warn('⚠️ Invalid webhook signature');
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }

      // Find pending order by request_id
      const order = await storage.getOrderByRequestId(payload.request_id);
      if (!order) {
        console.error('❌ Order not found for request_id:', payload.request_id);
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      // Parse webhook payload
      const orderDetails = airaloOrderService.parseWebhookPayload(payload);

      // Get all orders with this requestId (batch orders create multiple records)
      const batchOrders = await storage.getOrdersByRequestId(payload.request_id);

      if (batchOrders.length === 0) {
        console.error('❌ No orders found for request_id:', payload.request_id);
        return res.status(404).json({ success: false, message: 'No orders found' });
      }

      if (!orderDetails) {
        // Order failed - update all orders with this requestId
        for (const failedOrder of batchOrders) {
          await storage.updateOrder(failedOrder.id, {
            status: 'failed',
            webhookReceivedAt: new Date(),
          });

          // Create in-app notification for order failure
          if (failedOrder.userId) {
            await storage.createNotification({
              userId: failedOrder.userId,
              type: 'purchase',
              title: 'Order Failed',
              message: `Unfortunately, your eSIM order could not be completed. Please contact support for assistance.`,
              read: false,
              metadata: { orderId: failedOrder.id, reason: payload.meta?.message },
            });
          }
        }

        console.error('❌ Order failed:', payload.meta.message);
        return res.status(200).json({ success: true, message: 'Order failed, status updated' });
      }

      // Detect quantity mismatches
      if (batchOrders.length !== orderDetails.sims.length) {
        console.warn(
          `⚠️ Quantity mismatch for request_id ${payload.request_id}: ` +
          `${batchOrders.length} order records but ${orderDetails.sims.length} SIMs received. ` +
          `Processing ${Math.min(batchOrders.length, orderDetails.sims.length)} eSIMs.`,
        );
      }

      // Distribute SIM details across order records
      // Each order record gets one SIM's details
      for (let i = 0; i < Math.min(batchOrders.length, orderDetails.sims.length); i++) {
        const orderRecord = batchOrders[i];
        const simDetails = orderDetails.sims[i];

        await storage.updateOrder(orderRecord.id, {
          airaloOrderId: orderDetails.airaloOrderId,
          iccid: simDetails.iccid,
          qrCode: simDetails.qrCode,
          qrCodeUrl: simDetails.qrCodeUrl,
          lpaCode: simDetails.lpaCode,
          smdpAddress: simDetails.smdpAddress,
          activationCode: simDetails.activationCode,
          directAppleUrl: simDetails.directAppleUrl,
          apnType: simDetails.apnType,
          apnValue: simDetails.apnValue,
          isRoaming: simDetails.isRoaming,
          status: 'completed',
          webhookReceivedAt: new Date(),
        });

        // Send installation email for each assigned eSIM
        const user = await storage.getUser(orderRecord.userId);
        if (user && user.email) {
          const pkg = await storage.getPackageById(orderRecord.packageId);
          const installEmail = await generateInstallationEmail({
            name: user.name || 'Traveler',
            packageName: pkg ? `${pkg.dataAmount} - ${pkg.validity} Days` : 'eSIM Package',
            qrCodeUrl: simDetails.qrCodeUrl,
            iccid: simDetails.iccid,
            activationCode: simDetails.activationCode,
            smdpAddress: simDetails.smdpAddress,
            qrCode: simDetails.qrCode,
            lpaCode: simDetails.lpaCode,
          });

          await sendEmail({
            to: user.email,
            subject: installEmail.subject,
            html: installEmail.html,
          });

          await storage.updateOrder(orderRecord.id, { installationSent: true });

          // Create in-app notification for order completion (async webhook)
          await storage.createNotification({
            userId: orderRecord.userId,
            type: 'purchase',
            title: 'Order Confirmed',
            message: `Your ${pkg?.dataAmount || 'eSIM'} order is complete! Check your email for installation instructions.`,
            read: false,
            metadata: { orderId: orderRecord.id, iccid: simDetails.iccid },
          });

          // Create in-app notification for installation email sent
          await storage.createNotification({
            userId: orderRecord.userId,
            type: 'installation',
            title: 'eSIM Ready',
            message: `Your eSIM activation code has been sent to ${user.email}. Install it now to stay connected!`,
            read: false,
            metadata: { orderId: orderRecord.id, iccid: simDetails.iccid },
          });

          console.log(`✅ Webhook: Installation email and notifications sent to ${user.email}`);
        }
      }

      console.log(
        `✅ Batch order updated successfully from webhook. ${batchOrders.length} eSIMs processed.`,
      );
      ApiResponse.success(res, 'Webhook processed successfully', {
        esimsProcessed: batchOrders.length,
      });
    } catch (error: any) {
      console.error('❌ Webhook processing error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Airalo webhook for low data notifications
  app.post('/api/webhooks/airalo/low-data', async (req: Request, res: Response) => {
    let notificationId: string | undefined;

    try {
      const signature = req.headers['airalo-signature'] as string;
      const payload = req.body;

      console.log('📨 Low data webhook received:', payload);

      // Validate webhook signature (signature first, then stringified payload)
      const payloadString = JSON.stringify(payload);
      if (!airaloNotificationService.validateWebhookSignature(signature, payloadString)) {
        console.warn('⚠️ Invalid webhook signature for low-data notification');
        // Log invalid webhook attempt to database
        await storage.createAiraloNotification({
          type: 'low_data',
          webhookPayload: payload,
          signature,
          processed: true,
          emailSent: false,
          errorMessage: 'Invalid webhook signature',
        });
        return res.status(200).json({ success: true, message: 'Webhook received' });
      }

      // Extract webhook payload data
      const { iccid, threshold, remaining_data, total_data, expiry_date, package_name } = payload;

      if (!iccid || !threshold) {
        console.error('❌ Missing required fields in webhook payload');
        await storage.createAiraloNotification({
          type: 'low_data',
          webhookPayload: payload,
          signature,
          processed: true,
          emailSent: false,
          errorMessage: 'Missing required fields (iccid or threshold)',
        });
        return res.status(200).json({ success: true, message: 'Webhook received' });
      }

      // Find order by ICCID to get userId
      const order = await storage.getOrderByIccid(iccid);

      // Log notification to database
      const notification = await storage.createAiraloNotification({
        type: 'low_data',
        iccid,
        orderId: order?.id,
        userId: order?.userId,
        threshold,
        webhookPayload: payload,
        signature,
        processed: false,
        emailSent: false,
      });

      notificationId = notification.id;

      if (!order) {
        console.warn(`⚠️ Order not found for ICCID: ${iccid}`);
        await storage.updateAiraloNotification(notificationId, {
          processed: true,
          errorMessage: 'Order not found for ICCID',
        });
        return res.status(200).json({ success: true, message: 'Webhook received' });
      }

      if (!order.userId) {
        console.warn(`⚠️ Order ${order.id} has no userId`);
        await storage.updateAiraloNotification(notificationId, {
          processed: true,
          errorMessage: 'Order has no userId',
        });
        return res.status(200).json({ success: true, message: 'Webhook received' });
      }

      // Get user details
      const user = await storage.getUser(order.userId);
      if (!user) {
        console.warn(`⚠️ User not found for order: ${order.id}`);
        await storage.updateAiraloNotification(notificationId, {
          processed: true,
          errorMessage: 'User not found',
        });
        return res.status(200).json({ success: true, message: 'Webhook received' });
      }

      // Check if user has low data notifications enabled
      if (!user.notifyLowData) {
        console.log(`ℹ️ User ${user.email} has low data notifications disabled`);
        await storage.updateAiraloNotification(notificationId, {
          processed: true,
          errorMessage: 'User has notifications disabled',
        });
        return res.status(200).json({ success: true, message: 'Webhook received' });
      }

      // Check notification settings to see if this threshold is enabled
      const settingKey =
        threshold === '75_percent'
          ? 'notif_low_data_75'
          : threshold === '90_percent'
            ? 'notif_low_data_90'
            : threshold === '3_days'
              ? 'notif_expiring_3days'
              : threshold === '1_day'
                ? 'notif_expiring_1day'
                : null;

      if (settingKey) {
        const setting = await storage.getSettingByKey(settingKey);
        const isEnabled = setting?.value === 'true';

        if (!isEnabled) {
          console.log(`ℹ️ Notification threshold ${threshold} is disabled in settings`);
          await storage.updateAiraloNotification(notificationId, {
            processed: true,
            errorMessage: `Threshold ${threshold} is disabled in admin settings`,
          });
          return res.status(200).json({ success: true, message: 'Webhook received' });
        }
      }

      // Generate and send low data email
      const topupUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/my-esims`;
      const pkg = await storage.getPackageById(order.packageId);

      const emailData = await generateLowDataEmail({
        userName: user.name || user.email,
        threshold,
        remainingData: remaining_data ? `${remaining_data}MB` : 'Unknown',
        totalData: total_data ? `${total_data}MB` : order.dataAmount,
        packageName: package_name || pkg?.title || order.dataAmount,
        iccid,
        expiryDate: expiry_date,
        topupUrl,
      });

      await sendEmail({
        to: user.email,
        subject: emailData.subject,
        html: emailData.html,
      });

      // Determine notification type and title based on threshold
      const notificationType = threshold.includes('percent') ? 'expiring' : 'expiring';
      const notificationTitle =
        threshold === '75_percent'
          ? '75% Data Used'
          : threshold === '90_percent'
            ? '90% Data Used'
            : threshold === '3_days'
              ? '3 Days Remaining'
              : threshold === '1_day'
                ? '1 Day Remaining'
                : 'Low Data Alert';

      // Create in-app notification for low data alert
      if (user && order.userId) {
        await storage.createNotification({
          userId: order.userId,
          type: notificationType,
          title: notificationTitle,
          message: `Your eSIM has ${remaining_data ? `${remaining_data}MB` : 'limited data'} remaining${expiry_date ? ` and expires on ${expiry_date}` : ''}. Top up now to stay connected!`,
          read: false,
          metadata: { orderId: order.id, iccid, threshold },
        });

        console.log(`✅ In-app notification created for user ${user.email}`);
      }

      // Mark notification as processed and email sent
      await storage.updateAiraloNotification(notificationId, {
        processed: true,
        emailSent: true,
      });

      console.log(`✅ Low data notification processed and email sent to ${user.email}`);
      res.status(200).json({ success: true, message: 'Webhook processed successfully' });
    } catch (error: any) {
      console.error('❌ Low data webhook processing error:', error);

      // Log error to database if we have a notification ID
      if (notificationId) {
        await storage
          .updateAiraloNotification(notificationId, {
            processed: true,
            emailSent: false,
            errorMessage: error.message,
          })
          .catch((err) => console.error('Failed to update notification:', err));
      }

      // Always return 200 OK to acknowledge webhook receipt
      res.status(200).json({ success: true, message: 'Webhook received' });
    }
  });

  // ==================== PROMO CODE VALIDATION ====================

  // Validate promo codes (vouchers, gift cards, referral codes)
  app.post('/api/validate-promo-code', async (req: Request, res: Response) => {
    try {
      const { code, type, orderAmount = 0 } = req.body;

      if (!code || !type) {
        return res.status(400).json({
          success: false,
          message: 'Code and type are required',
        });
      }

      const userId = (req as any).session?.userId;
      const upperCode = code.toUpperCase().trim();

      if (type === 'voucher') {
        // Validate voucher code
        const voucher = await storage.getVoucherByCode(upperCode);

        if (!voucher) {
          return res.status(404).json({
            success: false,
            message: 'Invalid voucher code',
          });
        }

        // Check if voucher is active
        if (voucher.status !== 'active') {
          return res.status(400).json({
            success: false,
            message: 'This voucher is no longer active',
          });
        }

        // Check validity dates
        const now = new Date();
        if (now < new Date(voucher.validFrom) || now > new Date(voucher.validUntil)) {
          return res.status(400).json({
            success: false,
            message: 'This voucher has expired or is not yet valid',
          });
        }

        // Check max uses
        if (voucher.maxUses && voucher.currentUses >= voucher.maxUses) {
          return res.status(400).json({
            success: false,
            message: 'This voucher has reached its usage limit',
          });
        }

        // Check per-user limit if user is logged in
        if (userId && voucher.perUserLimit) {
          const userUsageCount = await storage.getVoucherUsageByUserAndVoucher(userId, voucher.id);
          if (userUsageCount >= voucher.perUserLimit) {
            return res.status(400).json({
              success: false,
              message: 'You have already used this voucher',
            });
          }
        }

        // Check minimum purchase amount
        const minPurchase = parseFloat(voucher.minPurchaseAmount || '0');
        if (orderAmount < minPurchase) {
          return res.status(400).json({
            success: false,
            message: `Minimum purchase of $${minPurchase.toFixed(2)} required for this voucher`,
          });
        }

        // Calculate discount
        let discount = 0;
        if (voucher.type === 'percentage') {
          discount = (orderAmount * parseFloat(voucher.value)) / 100;
          // Apply max discount cap if set
          if (voucher.maxDiscountAmount) {
            discount = Math.min(discount, parseFloat(voucher.maxDiscountAmount));
          }
        } else {
          // Fixed amount
          discount = Math.min(parseFloat(voucher.value), orderAmount);
        }

        return res.json({
          success: true,
          type: 'voucher',
          code: upperCode,
          voucherId: voucher.id,
          discountType: voucher.type,
          discountValue: parseFloat(voucher.value),
          discount: Math.round(discount * 100) / 100,
          description:
            voucher.description ||
            `${voucher.type === 'percentage' ? voucher.value + '%' : '$' + voucher.value} off`,
        });
      } else if (type === 'giftcard') {
        // Validate gift card code
        const giftCard = await storage.getGiftCardByCode(upperCode);

        if (!giftCard) {
          return res.status(404).json({
            success: false,
            message: 'Invalid gift card code',
          });
        }

        // Check if gift card is active
        if (giftCard.status !== 'active') {
          return res.status(400).json({
            success: false,
            message: 'This gift card is no longer active',
          });
        }

        // Check expiration
        if (giftCard.expiresAt && new Date() > new Date(giftCard.expiresAt)) {
          return res.status(400).json({
            success: false,
            message: 'This gift card has expired',
          });
        }

        // Check balance
        const balance = parseFloat(giftCard.balance);
        if (balance <= 0) {
          return res.status(400).json({
            success: false,
            message: 'This gift card has no remaining balance',
          });
        }

        // Calculate how much can be applied
        const applicableAmount = Math.min(balance, orderAmount);

        return res.json({
          success: true,
          type: 'giftcard',
          code: upperCode,
          giftCardId: giftCard.id,
          balance: balance,
          discount: Math.round(applicableAmount * 100) / 100,
          currency: giftCard.currency,
          description: `Gift card with $${balance.toFixed(2)} balance`,
        });
      } else if (type === 'referral') {
        // 1️⃣ Validate referral code
        const referrer = await storage.getUserByReferralCode(upperCode);

        if (!referrer) {
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code',
          });
        }

        // 2️⃣ Load referral settings
        const referralSettings = await storage.getReferralSettings();

        if (!referralSettings || !referralSettings.enabled) {
          return res.status(400).json({
            success: false,
            message: 'Referral program is currently disabled',
          });
        }

        // 3️⃣ Minimum order check
        const minOrderAmount = Number(referralSettings.minOrderAmount);

        if (orderAmount < minOrderAmount) {
          return res.status(400).json({
            success: false,
            message: `Minimum order of $${minOrderAmount.toFixed(2)} required for referral`,
          });
        }

        // 4️⃣ Calculate discount for referred user
        const discountType = referralSettings.rewardType; // fixed | percentage
        const discountValue = Number(referralSettings.referredUserDiscount);

        let discount = 0;

        if (discountType === 'percentage') {
          discount = (orderAmount * discountValue) / 100;
        } else {
          discount = Math.min(discountValue, orderAmount);
        }

        discount = Number(discount.toFixed(2));

        // 5️⃣ Final response
        return res.json({
          success: true,
          type: 'referral',
          code: upperCode,
          referrerId: referrer.id,
          discountType,
          discountValue,
          discount,
          description:
            discountType === 'percentage'
              ? `Referral discount: ${discountValue}% off`
              : `Referral discount: $${discountValue} off`,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid code type. Use 'voucher', 'giftcard', or 'referral'",
        });
      }
    } catch (error: any) {
      console.error('Error validating promo code:', error);
      res.status(500).json({ success: false, message: 'Error validating code: ' + error.message });
    }
  });

  // ==================== GUEST CHECKOUT ROUTES ====================

  // Create payment intent for guest checkout
  app.post('/api/guest/create-payment-intent', async (req: Request, res: Response) => {
    try {
      const {
        packageId,
        email,
        phone,
        quantity = 1,
        promoCode = null,
        promoType = null,
        promoDiscount = 0,
        voucherId = null,
        giftCardId = null,
        referrerId = null,
        requestedCurrency = 'USD',
        referralCredits = 0,
      } = req.body;

      if (!packageId || !email) {
        return res
          .status(400)
          .json({ success: false, message: 'Package ID and email are required' });
      }

      const pkg = await storage.getUnifiedPackageById(packageId);
      if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

      // ----------------------------
      // Currency + Retail Price Logic
      // ----------------------------
      const currencies = await storage.getCurrencies();
      const fromCurrency = currencies.find((c) => c.code.toUpperCase() === 'USD');
      const toCurrency = currencies.find((c) => c.code.toUpperCase() === (requestedCurrency || '').toUpperCase());

      if (!fromCurrency) throw new Error('USD base currency not found');
      if (!toCurrency) throw new Error(`Target currency not found: ${requestedCurrency}`);

      const wholesaleUSD = parseFloat(pkg.wholesalePrice);
      const provider = await storage.getProviderById(pkg.providerId);
      const providerMargin = parseFloat(provider.pricingMargin);

      // Base retail in USD
      const baseRetailUSD = wholesaleUSD * (1 + providerMargin / 100);

      // Convert to requested currency
      const fromRate = parseFloat(fromCurrency.conversionRate); // always USD
      const toRate = parseFloat(toCurrency.conversionRate);

      let unitPrice = (baseRetailUSD / fromRate) * toRate;

      // Round properly
      unitPrice = parseFloat(unitPrice.toFixed(2));

      // ----------------------------
      // Quantity
      // ----------------------------
      const validQuantity = Math.max(1, Math.min(10, parseInt(quantity) || 1));
      const subtotal = unitPrice * validQuantity;

      let discount = 0;
      let validatedPromoDiscount = 0;

      // ----------------------------
      // Voucher / Gift / Referral Promo
      // ----------------------------
      if (promoCode && promoType) {
        if (promoType === 'voucher' && voucherId) {
          const voucher = await storage.getVoucherByCode(promoCode);
          if (voucher && voucher.status === 'active') {
            const now = new Date();
            if (now >= new Date(voucher.validFrom) && now <= new Date(voucher.validUntil)) {
              if (voucher.type === 'percentage') {
                validatedPromoDiscount = (subtotal * parseFloat(voucher.value)) / 100;

                if (voucher.maxDiscountAmount) {
                  validatedPromoDiscount = Math.min(
                    validatedPromoDiscount,
                    parseFloat(voucher.maxDiscountAmount),
                  );
                }
              } else {
                validatedPromoDiscount = Math.min(parseFloat(voucher.value), subtotal);
              }
            }
          }
        }

        if (promoType === 'giftcard' && giftCardId) {
          const giftCard = await storage.getGiftCardByCode(promoCode);
          if (giftCard && giftCard.status === 'active') {
            const balance = parseFloat(giftCard.balance);
            validatedPromoDiscount = Math.min(balance, subtotal);
          }
        }

        if (promoType === 'referral' && referrerId) {
          validatedPromoDiscount = Math.min(promoDiscount, subtotal);
        }

        discount += validatedPromoDiscount;
        console.log(
          `[Guest Checkout] Promo ${promoType} ${promoCode}: ${validatedPromoDiscount.toFixed(2)} ${requestedCurrency} discount`,
        );
      }

      // ----------------------------
      // Referral Credits (Logged in users)
      // ----------------------------
      let appliedCredits = 0;
      let userId: string | null = null;

      if (referralCredits > 0 && (req as any).session?.userId) {
        userId = (req as any).session.userId;
        const user = await storage.getUserById(userId);

        if (user?.referralBalance) {
          const available = parseFloat(user.referralBalance);
          appliedCredits = Math.min(referralCredits, available, subtotal - discount);
          discount += appliedCredits;

          console.log(
            `[Guest Checkout] Referral credits applied: ${appliedCredits} ${requestedCurrency}`,
          );
        }
      }

      // ----------------------------
      // Final Total
      // ----------------------------
      const total = Math.max(subtotal - discount, 0.5); // minimum 0.50 in selected currency
      const amountInMinor = Math.round(total * 100);

      // ----------------------------
      // Stripe Customer
      // ----------------------------
      const customer = await stripe.customers.create({
        email,
        phone: phone || undefined,
        metadata: { guestCheckout: 'true' },
      });

      const guestAccessToken = crypto.randomUUID();

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInMinor,
        currency: requestedCurrency.toLowerCase(),
        customer: customer.id,
        description: `eSIM Guest Purchase - ${pkg.title} x${validQuantity}`,
        receipt_email: email,
        payment_method_types: ['card'],
        metadata: {
          packageId: pkg.id,
          quantity: String(validQuantity),
          guestAccessToken,
          guestEmail: email,
          guestPhone: phone || '',
          promoCode: promoCode || '',
          promoType: promoType || '',
          promoDiscount: String(validatedPromoDiscount),
          voucherId: voucherId || '',
          giftCardId: giftCardId || '',
          referrerId: referrerId || '',
          referralCredits: String(appliedCredits),
          userId: userId || '',
          currency: requestedCurrency,
          unitPrice: String(unitPrice),
          subtotal: String(subtotal),
          total: String(total),
        },
      });

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        amount: total,
        currency: requestedCurrency,
        quantity: validQuantity,
        unitPrice,
        subtotal,
        discount,
      });
    } catch (error: any) {
      console.error('Error creating guest payment intent:', error);
      res.status(500).json({ success: false, message: error.message || 'Payment failed' });
    }
  });




  app.post('/api/guest/confirm-payment', async (req: Request, res: Response) => {
    try {
      const { paymentIntentId, providerType, paymentId, signature, metadata: reqMetadata } = req.body;
      const orderId = req.body.orderId || req.body.paypal?.orderId || req.body.paypal?.order_id || req.body.paymentId;

      if (!providerType) {
        return res.status(400).json({ success: false, message: 'providerType missing' });
      }

      let body: any;

      switch (providerType) {
        case 'stripe':
          if (!paymentIntentId)
            return res.status(400).json({ success: false, message: 'paymentIntentId missing' });
          body = { provider: 'stripe', stripe: { paymentIntentId } };
          break;

        case 'razorpay':
          if (!orderId || !paymentId || !signature)
            return res.status(400).json({ success: false, message: 'Razorpay data missing' });
          body = { provider: 'razorpay', razorpay: { orderId, paymentId, signature } };
          break;

        case 'paypal':
          body = { provider: 'paypal', paypal: { orderId } };
          break;

        case 'paystack':
          body = { provider: 'paystack', paystack: { reference: orderId } };
          break;

        case 'yookassa':
          console.log('[confirm-payment] Guest 1 lookup for orderId:', orderId);
          const dbOrderGuest1 = await storage.getOrderById(orderId);
          console.log('[confirm-payment] Guest 1 order record:', dbOrderGuest1);
          const yookassaPaymentIdGuest1 = dbOrderGuest1?.stripePaymentIntentId || dbOrderGuest1?.transactionId || paymentId;
          console.log('[confirm-payment] Guest 1 yookassaPaymentId:', yookassaPaymentIdGuest1);
          body = { provider: 'yookassa', yookassa: { orderId, paymentId: yookassaPaymentIdGuest1 } };
          break;

        case 'powertranz':
          const { spiToken, orderId: ptOrderId } = req.body;
          if (!spiToken || !ptOrderId)
            return res.status(400).json({
              success: false,
              message: 'PowerTranz data (`spiToken`, `orderId`) missing',
            });
          body = { provider: 'powertranz', powertranz: { spiToken, orderId: ptOrderId } };
          break;

        case 'free':
          body = { provider: 'free', currency: req.body.metadata?.currency || 'USD', metadata: req.body.metadata };
          break;

        case 'midtrans':
          body = {
            provider: 'midtrans',
            midtrans: {
              orderId,
              transactionId: req.body.transactionId || req.body.transaction_id || paymentId,
              statusCode: req.body.statusCode || req.body.status_code,
              transactionStatus: req.body.transactionStatus || req.body.transaction_status,
            },
            orderId,
            amount: req.body.amount,
            currency: req.body.currency,
          };
          break;

        default:
          return res.status(400).json({ success: false, message: 'Unsupported provider' });
      }

      // ── Verify payment ──────────────────────────────────────────────────────
      const baseUrl1 = (process.env.BASE_URL || 'http://127.0.0.1:5000').replace('://localhost', '://127.0.0.1');
      const verifyResponse = await axios.post(
        `${baseUrl1}/api/payments/confirm-payments`,
        body,
      );

      console.log('Verification response:', verifyResponse.data);
      const verification = verifyResponse.data;
      if (!verification.success) return res.status(400).json(verification);

      const metadata = verification.metadata;
      console.log('Payment intent metadata:', metadata);

      // Allow both types since UnifiedCheckout now uses this route for free orders
      if (metadata.type !== 'guest_purchase' && metadata.type !== 'package_purchase') {
        return res.status(400).json({ success: false, message: 'Invalid payment intent type' });
      }

      const packageId = metadata.packageId;
      const guestEmail = metadata.guestEmail || metadata.email;
      const guestPhone = metadata.guestPhone || metadata.phone;
      const guestAccessToken = metadata.guestAccessToken;
      const quantity = parseInt(metadata.quantity || '1', 10);

      // If we have a userId from metadata (logged-in), we don't strictly require guestAccessToken for provision
      if (!guestEmail || (!guestAccessToken && !metadata.userId) || !packageId) {
        return res.status(400).json({ success: false, message: 'Invalid payment intent metadata' });
      }

      // Idempotency check
      const targetOrderId = metadata?.existingOrderId || metadata?.orderId || orderId || (req.body && req.body.orderId);
      let order = (guestAccessToken ? await storage.getOrderByGuestAccessToken(guestAccessToken) : null)
        || (targetOrderId ? await storage.getOrderById(targetOrderId) : null);

      if (order) {
        if (order.status === 'completed' || order.iccid || order.providerOrderId) {
          return res.json({
            success: true,
            message: 'Order already exists',
            orderId: order.id,
            guestAccessToken: order.guestAccessToken || guestAccessToken,
          });
        }
        if (order.status === 'processing') {
          console.log(`⏳ Guest Order ${order.id} is already in processing state. Waiting for completion...`);
          for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const currentOrder = await storage.getOrderById(order.id);
            if (currentOrder && (currentOrder.status === 'completed' || currentOrder.iccid || currentOrder.providerOrderId)) {
              return res.json({
                success: true,
                message: 'Order already completed successfully',
                orderId: currentOrder.id,
                guestAccessToken: currentOrder.guestAccessToken || guestAccessToken,
              });
            }
          }
          return res.json({
            success: true,
            message: 'Order is currently processing',
            orderId: order.id,
            guestAccessToken: order.guestAccessToken || guestAccessToken,
          });
        }
      }

      const { resolvePackage, getProviderSpecificPackageId } =
        await import('./services/packages/package-resolver');

      const pkg = await resolvePackage(packageId);
      if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

      // Get or create user
      let user = await storage.getUserByEmail(guestEmail);
      if (!user) {
        user = await storage.createUser({
          email: guestEmail,
          phone: guestPhone || null,
          name: guestEmail.split('@')[0],
        });
      }

      const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND'];

      function normalizePaymentAmount(
        amount: number,
        currency: string,
        provider: string,
      ): number {
        const cur = currency.toUpperCase();
        if (provider === 'stripe' || provider === 'paypal' || provider === 'powertranz') return amount;
        if (provider === 'razorpay' || provider === 'paystack') {
          return ZERO_DECIMAL_CURRENCIES.includes(cur) ? amount : amount / 100;
        }
        return amount;
      }

      const paidCurrency = verification.currency.toUpperCase();
      const paidAmount = normalizePaymentAmount(
        verification.amount, paidCurrency, verification.provider,
      );
      const totalPrice = paidAmount.toString();

      if (order) {
        if (order.status === 'completed' || order.iccid || order.providerOrderId) {
          return res.json({ success: true, order, message: 'Order already completed successfully' });
        }
        order = await storage.updateOrder(order.id, {
          userId: user.id,
          status: 'processing',
          paymentMethod: verification.paymentMethod || verification.provider || 'card',
          transactionId: verification.transactionId,
          stripePaymentIntentId: paymentIntentId || undefined,
          orderCurrency: paidCurrency || 'USD',
          price: totalPrice,
        });
      } else {
        order = await storage.createOrder({
          id: targetOrderId || undefined,
          userId: user.id,
          packageId: pkg.id,
          providerId: pkg.providerId,
          status: 'processing',
          orderType: quantity > 1 ? 'batch' : 'single',
          quantity,
          price: totalPrice,
          wholesalePrice: pkg.wholesalePrice?.toString() || null,
          currency: paidCurrency || 'USD',
          orderCurrency: paidCurrency || 'USD',
          dataAmount: pkg.dataAmount,
          validity: pkg.validity,
          stripePaymentIntentId: paymentIntentId,
          paymentMethod: verification.paymentMethod || verification.provider || 'card',
          transactionId: verification.transactionId,
          guestAccessToken,
          guestEmail,
          guestPhone: guestPhone || null,
        });
      }

      let simDetails: any = null;
      let orderDetails: any = null;

      try {
        if (quantity === 1) {
          // ── Provision eSIM ─────────────────────────────────────────────
          if (pkg.providerId && pkg.providerPackageTable && pkg.providerPackageId) {
            const { providerFactory } = await import('./providers/provider-factory');
            const providerService = await providerFactory.getServiceById(pkg.providerId);

            const providerApiPackageId = await getProviderSpecificPackageId(
              pkg.providerPackageTable, pkg.providerPackageId,
            );
            if (!providerApiPackageId) throw new Error('Provider package ID not found');

            const providerResponse = await providerService.createOrder({
              packageId: providerApiPackageId,
              quantity: 1,
              customerRef: `Order ${order.id}`,
            });
            if (!providerResponse.success)
              throw new Error(providerResponse.errorMessage || 'Provider order failed');

            simDetails = {
              iccid: providerResponse.iccid,
              qrCode: providerResponse.qrCode,
              qrCodeUrl: providerResponse.qrCodeUrl || null, // null for some providers
              smdpAddress: providerResponse.smdpAddress,
              activationCode: providerResponse.activationCode,
              lpaCode: providerResponse.qrCode,
              directAppleUrl: null,
              apnType: 'automatic',
              apnValue: null,
              isRoaming: null,
            };
            orderDetails = {
              providerOrderId: providerResponse.providerOrderId,
              requestId: providerResponse.requestId,
            };
          } else if (pkg.airaloId) {
            const airaloResponse = await airaloOrderService.submitSingleOrder(
              pkg.airaloId, 1, `Order ${order.id}`,
            );
            orderDetails = { providerOrderId: airaloResponse.airaloOrderId };
            simDetails = airaloResponse.sims[0];
          } else {
            throw new Error('Invalid package configuration');
          }

          // ── QR Code URL resolution ──────────────────────────────────────
          // Priority 1: provider gave URL  → use directly
          // Priority 2: no URL from provider → generate PNG locally,
          //             save to uploads/qrcodes/, return public URL
          let finalQrUrl: string | null = simDetails?.qrCodeUrl || null;

          if (!finalQrUrl && simDetails?.lpaCode) {
            console.log('⚠️  No qrCodeUrl from provider — generating locally...');
            finalQrUrl = await generateAndSaveQrCode(simDetails.lpaCode, order.id);
          }

          console.log('📎 Final QR URL for email:', finalQrUrl);

          // ── Persist SIM details ─────────────────────────────────────────
          order = await storage.updateOrder(order.id, {
            providerOrderId: orderDetails.providerOrderId,
            airaloOrderId: orderDetails.providerOrderId,
            iccid: simDetails.iccid,
            qrCode: simDetails.qrCode,
            qrCodeUrl: finalQrUrl,           // ← resolved URL stored in DB
            lpaCode: simDetails.lpaCode,
            smdpAddress: simDetails.smdpAddress,
            activationCode: simDetails.activationCode,
            directAppleUrl: simDetails.directAppleUrl,
            apnType: simDetails.apnType,
            apnValue: simDetails.apnValue,
            isRoaming: simDetails.isRoaming,
            status: 'completed',
          });

        } else {
          // ── Batch ───────────────────────────────────────────────────────
          if (pkg.airaloId) {
            const batchResult = await airaloOrderService.submitBatchOrder(pkg.airaloId, quantity);
            order = await storage.updateOrder(order.id, {
              requestId: batchResult.requestId,
              status: 'processing',
            });
          } else {
            throw new Error('Batch orders not supported for this provider');
          }
        }

        // ── Referral ────────────────────────────────────────────────────
        if (metadata.promoType === 'referral' && metadata.promoCode) {
          await handleReferralAfterOrder({
            referredUserId: user.id,
            promoCode: metadata.promoCode,
            orderId: order.id,
            orderAmount: paidAmount,
          });
        }

        // ── Deduct referral credits ──────────────────────────────────────
        const usedCredits = parseFloat(metadata.referralCredits || '0');
        if (usedCredits > 0 && metadata.userId) {
          try {
            const creditUser = await storage.getUserById(metadata.userId);
            if (creditUser && creditUser.referralBalance) {
              const currentBalance = parseFloat(creditUser.referralBalance);
              const newBalance = Math.max(0, currentBalance - usedCredits);
              await storage.updateUser(metadata.userId, { referralBalance: newBalance.toFixed(2) });
              await storage.createReferralTransaction({
                userId: metadata.userId,
                orderId: order.id,
                amount: (-usedCredits).toFixed(2),
                type: 'credit_used',
                balanceAfter: newBalance.toFixed(2),
                balanceBefore: currentBalance.toFixed(2),
                referralId: metadata.referralId,
                description: `Used $${usedCredits.toFixed(2)} credits on order ${order.displayOrderId || order.id}`,
              });
            }
          } catch (creditError: any) {
            console.error('[Guest Order] Error deducting referral credits:', creditError.message);
          }
        }

        // ── Promo codes ──────────────────────────────────────────────────
        if (metadata.promoType && metadata.promoCode) {
          try {
            if (metadata.promoType === 'voucher' && metadata.voucherId) {
              await storage.incrementVoucherUsage(metadata.voucherId);
              await storage.createVoucherUsage({
                voucherId: metadata.voucherId,
                userId: user.id,
                orderId: order.id,
                discountAmount: metadata.promoDiscount,
              });
            } else if (metadata.promoType === 'giftcard' && metadata.giftCardId) {
              const giftCard = await storage.getGiftCardByCode(metadata.promoCode);
              if (giftCard) {
                const promoDiscount = parseFloat(metadata.promoDiscount || '0');
                const currentBalance = parseFloat(giftCard.balance);
                const newBalance = Math.max(0, currentBalance - promoDiscount);
                await storage.updateGiftCardBalance(metadata.giftCardId, newBalance.toFixed(2));
                await storage.createGiftCardTransaction({
                  giftCardId: metadata.giftCardId,
                  usedBy: user.id,
                  orderId: order.id,
                  amount: (-promoDiscount).toFixed(2),
                  type: 'redemption',
                  description: `Redeemed $${promoDiscount.toFixed(2)} on order ${order.displayOrderId || order.id}`,
                  balanceAfter: newBalance.toFixed(2),
                });
              }
            }
          } catch (promoError: any) {
            console.error('[Guest Order] Error processing promo code:', promoError.message);
          }
        }

        // ── 1️⃣ Confirmation email ─────────────────────────────────────────
        const confirmEmail = await generateOrderConfirmationEmail({
          id: order.id,
          destination: pkg.countryName || 'Unknown',
          dataAmount: pkg.dataAmount,
          validity: pkg.validity,
          price: pkg.price,
        });
        await sendEmail({ to: guestEmail, subject: confirmEmail.subject, html: confirmEmail.html });
        console.log('✅ Guest confirmation email sent');

        // ── 2️⃣ Installation email ─────────────────────────────────────────
        if (order.status === 'completed' && !order.installationSent) {
          try {
            const installationEmail = await generateInstallationEmail({
              name: user?.name || guestEmail.split('@')[0] || 'Customer',
              packageName: pkg.title || pkg.name || 'Your eSIM Package',
              qrCodeUrl: order.qrCodeUrl || null,   // ✅ always a real URL or null
              iccid: simDetails?.iccid,
              lpaCode: simDetails?.lpaCode,
              activationCode: simDetails?.activationCode,
              smdpAddress: simDetails?.smdpAddress,
            });

            await sendEmail({
              to: guestEmail,
              subject: installationEmail.subject,
              html: installationEmail.html,
              attachments: [],                           // no CID needed
            });

            await storage.updateOrder(order.id, { installationSent: true });
            console.log('✅ Guest installation email sent');
          } catch (err) {
            console.error('❌ Guest installation email error:', err);
          }
        }

        return res.json({
          success: true,
          message: 'Order created successfully',
          orderId: order.id,
          guestAccessToken,
        });
      } catch (err: any) {
        console.error('Provider error:', err);
        await storage.updateOrder(order.id, { status: 'failed' });
        throw new Error('Failed to provision eSIM: ' + err.message);
      }
    } catch (error: any) {
      console.error('Error confirming guest payment:', error);
      res.status(500).json({ success: false, message: 'Error processing order: ' + error.message });
    }
  });

  // Confirm guest payment and create order
  app.post('/api/guest/confirm-payment-old', async (req: Request, res: Response) => {
    try {
      const { paymentIntentId, providerType, orderId, paymentId, signature } = req.body;

      // new flow

      // check verify payment status

      if (!providerType) {
        return res.status(400).json({
          success: false,
          message: 'providerType missing',
        });
      }

      let body: any;

      switch (providerType) {
        case 'stripe':
          if (!paymentIntentId) {
            return res.status(400).json({
              success: false,
              message: 'paymentIntentId missing',
            });
          }

          body = {
            provider: 'stripe',
            stripe: { paymentIntentId },
          };
          break;

        case 'razorpay':
          if (!orderId || !paymentId || !signature) {
            return res.status(400).json({
              success: false,
              message: 'Razorpay data missing',
            });
          }

          body = {
            provider: 'razorpay',
            razorpay: { orderId, paymentId, signature },
          };
          break;

        case 'paypal':
          body = {
            provider: 'paypal',
            paypal: { orderId },
          };
          break;

        case 'paystack':
          body = {
            provider: 'paystack',
            paystack: { reference: orderId },
          };
          break;

        case 'yookassa':
          const dbOrderGuestOld = await storage.getOrderById(orderId);
          const yookassaPaymentIdGuestOld = dbOrderGuestOld?.stripePaymentIntentId || dbOrderGuestOld?.transactionId || paymentId;
          body = {
            provider: 'yookassa',
            yookassa: { orderId, paymentId: yookassaPaymentIdGuestOld },
          };
          break;

        case 'iap-android':
          if (!req.body.purchaseToken || !req.body.productId || !req.body.packageName) {
            return res.status(400).json({ success: false, message: 'IAP Android data missing' });
          }
          body = {
            provider: 'iap-android',
            iap: {
              purchaseToken: req.body.purchaseToken,
              productId: req.body.productId,
              packageName: req.body.packageName
            },
            metadata: req.body.metadata,
            amount: req.body.amount,
            currency: req.body.currency
          };
          break;

        case 'iap-ios':
          if (!req.body.receiptData) {
            return res.status(400).json({ success: false, message: 'IAP iOS data missing' });
          }
          body = {
            provider: 'iap-ios',
            iap: {
              receiptData: req.body.receiptData,
              productId: req.body.productId
            },
            metadata: req.body.metadata,
            amount: req.body.amount,
            currency: req.body.currency
          };
          break;

        default:
          return res.status(400).json({
            success: false,
            message: 'Unsupported provider',
          });
      }

      // 🔐 CALL UNIFIED VERIFY API
      const apiBaseUrl1 = (process.env.API_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:5000').replace('://localhost', '://127.0.0.1');
      const verifyResponse = await axios.post(
        `${apiBaseUrl1}/api/payments/confirm-payments`,
        body,
      );

      console.log('CHEKKKKKKKKKK verification responseee', verifyResponse?.data);
      const verification = verifyResponse.data;

      if (!verification.success) {
        return res.status(400).json(verification);
      }

      // new flow

      const metadata = { ...reqMetadata, ...verification.metadata };

      console.log('Payment intent metadata:', metadata);

      /* =====================================================
         ================== GIFT CARD ========================
         ===================================================== */
      if (metadata?.type === 'gift_card') {
        const { amount, currency, guestEmail, recipientEmail, recipientName, message, userId } = metadata;

        try {
          const { giftCards } = await import('@shared/schema');
          const getUserByEmail = await storage.getUserByEmail(guestEmail);
          const code = generateGiftCardCode();

          const [giftCard] = await db.insert(giftCards).values({
            code,
            amount: amount?.toString(),
            currency: currency || 'USD',
            balance: amount?.toString(),
            purchasedBy: userId || getUserByEmail?.id || null,
            recipientEmail: recipientEmail || null,
            recipientName: recipientName || null,
            message: message || null,
            status: 'active',
          }).returning();

          // 🔥 SEND GIFT CARD EMAIL
          try {
            let senderName = "A Friend";

            if (userId) {
              const sender = await storage.getUserById(userId);
              if (sender?.name) senderName = sender.name;
            }

            const emailData = {
              ...giftCard,
              senderName,
              recipientName: giftCard.recipientName || "Valued Customer",
            };

            const emailContent = await generateGiftCardEmail(emailData);

            await sendEmail({
              to: giftCard.recipientEmail,
              subject: emailContent.subject,
              html: emailContent.html,
            });
            console.log(`✅ Gift card email sent to ${giftCard.recipientEmail}`);
          } catch (emailError) {
            console.error('❌ Gift card email failed but purchase succeeded:', emailError);
          }

          return res.json({
            success: true,
            giftCard,
            message: 'Gift card purchased successfully',
          });
        } catch (error: any) {
          console.error('Error creating gift card:', error);
          return res.status(500).json({ success: false, message: 'Failed to create gift card' });
        }
      }

      if (metadata.type !== 'guest_purchase') {
        return res.status(400).json({ success: false, message: 'Invalid payment intent type' });
      }

      const packageId = metadata.packageId;
      const guestEmail = metadata.guestEmail;
      const guestPhone = metadata.guestPhone;
      const guestAccessToken = metadata.guestAccessToken;
      const quantity = parseInt(metadata.quantity || '1', 10);

      if (!guestEmail || !guestAccessToken || !packageId) {
        return res.status(400).json({ success: false, message: 'Invalid payment intent metadata' });
      }

      // Check if order already exists (idempotency)
      const existingOrder = await storage.getOrderByGuestAccessToken(guestAccessToken);
      if (existingOrder) {
        if (existingOrder.status === 'completed' || existingOrder.iccid || existingOrder.providerOrderId) {
          return res.json({ success: true, order: existingOrder, message: 'Order already completed successfully' });
        }
        return res.json({
          success: true,
          message: 'Order already exists',
          orderId: existingOrder.id,
          guestAccessToken: guestAccessToken,
        });
      }

      // Get package details
      const pkg = await storage.getUnifiedPackageById(packageId);
      if (!pkg) {
        return res.status(404).json({ success: false, message: 'Package not found' });
      }

      // Check if user exists, if not create one
      let user = await storage.getUserByEmail(guestEmail);
      if (!user) {
        user = await storage.createUser({
          email: guestEmail,
          phone: guestPhone || null,
          name: guestEmail.split('@')[0],
        });
      }

      // Create the order
      // const unitPrice = parseFloat(pkg.retailPrice.toString());
      // const unitPrice = parseFloat(verifyResponse.data.amount.toString())
      const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND'];

      function normalizePaymentAmount(
        amount: number,
        currency: string,
        provider: string,
      ): number {
        const cur = currency.toUpperCase();

        // Stripe & PayPal already return decimal amounts
        if (provider === 'stripe' || provider === 'paypal') {
          return amount;
        }

        // Razorpay & Paystack return smallest units
        if (provider === 'razorpay' || provider === 'paystack') {
          if (ZERO_DECIMAL_CURRENCIES.includes(cur)) {
            return amount;
          }
          return amount / 100;
        }

        return amount;
      }

      const paidCurrency = verification.currency.toUpperCase();

      const paidAmount = normalizePaymentAmount(
        verification.amount,
        paidCurrency,
        verification.provider,
      );

      const totalPrice = (paidAmount * quantity).toString();
      const order = await storage.createOrder({
        userId: user.id,
        packageId: pkg.id,
        providerId: pkg.providerId,
        status: 'processing',
        orderType: quantity > 1 ? 'batch' : 'single',
        quantity: quantity,
        price: totalPrice,
        wholesalePrice: pkg.wholesalePrice?.toString() || null,
        currency: paidCurrency || 'USD',
        orderCurrency: paidCurrency || 'USD',
        dataAmount: pkg.dataAmount,
        validity: pkg.validityDays,
        stripePaymentIntentId: paymentIntentId,
        paymentMethod: 'card',
        guestAccessToken: guestAccessToken,
        guestEmail: guestEmail,
        guestPhone: guestPhone || null,
      });

      // Trigger eSIM provisioning via OrderingEngine (with smart failover)

      try {
        if (pkg.providerId) {
          const { orderingEngine } = await import('./services/ordering/ordering-engine');
          const transactionId =
            paymentId || paymentIntentId || verification.referenceId || `ORDER-${order.id}`;

          const { resolvePackage } = await import('./services/packages/package-resolver');

          const packagee = await resolvePackage(packageId);
          if (!pkg) {
            return res.status(404).json({
              success: false,
              message: 'Package not found',
            });
          }

          const { getProviderSpecificPackageId } =
            await import('./services/packages/package-resolver');

          const providerPackageId = await getProviderSpecificPackageId(
            pkg.providerPackageTable,
            pkg.providerPackageId,
          );
          console.log('@@@@@@@@@@@@@@@@@@@', providerPackageId, pkg);

          if (!providerPackageId) {
            throw new Error('Provider package ID not found');
          }

          console.log(
            `[Guest Order] Provisioning ${quantity} eSIM(s) via OrderingEngine for order ${order.id}`,
          );

          //           const orderResult = await orderingEngine.createOrder({
          //   orderId: order.id,
          //   packageId: packagee?.id,
          //   unifiedPackageId: pkg.id,
          //   quantity,
          //   customerEmail: guestEmail,
          //   customerPhone: guestPhone,
          //   source: "guest_checkout",
          //   transactionId: paymentId,
          //   partnerReference: `Order ${order.id}`,
          //   providerPackageId: packagee?.id
          // });

          // const orderResult = await orderingEngine.createOrder({
          //   orderId: order.id,
          //   packageId: providerPackageId,
          //   unifiedPackageId: pkg.id,
          //   quantity,
          //   customerEmail: guestEmail,
          //   customerPhone: guestPhone || undefined,
          //   source: "guest_checkout",
          //   transactionId:
          //     paymentId || paymentIntentId || `ORDER-${order.id}`,
          //   partnerReference: `Order ${order.id}`,
          //   providerPackageId: providerPackageId
          // });

          const orderResult = await orderingEngine.createOrder({
            orderId: order.id,
            packageId: pkg.id, // ✅ ONLY unified package id
            unifiedPackageId: pkg.id,
            quantity,
            customerEmail: guestEmail,
            customerPhone: guestPhone || undefined,
            source: 'guest_checkout',
            transactionId: paymentId || paymentIntentId || `ORDER-${order.id}`,
            partnerReference: `Order ${order.id}`,
          });

          if (!orderResult.success) {
            throw new Error(orderResult.error || 'Provider order failed');
          }

          const esimDetail = orderResult.esimDetails?.[0];

          // Update order with eSIM details and failover metadata
          await storage.updateOrder(order.id, {
            providerOrderId: orderResult.providerOrderId || null,
            providerId: orderResult.finalProviderId,
            iccid: esimDetail?.iccid || null,
            qrCode: esimDetail?.qrCode || null,
            qrCodeUrl: esimDetail?.qrCodeUrl || null,
            lpaCode: esimDetail?.lpaCode || esimDetail?.qrCode || null,
            smdpAddress: esimDetail?.smdpAddress || null,
            activationCode: esimDetail?.activationCode || null,
            status: 'completed',
            originalProviderId: orderResult.originalProviderId,
            finalProviderId: orderResult.finalProviderId,
            failoverAttempts: orderResult.attempts,
          });

          // Log if failover was used
          if (orderResult.failoverUsed) {
            console.log(
              `[Guest Order] Failover used for order ${order.id}: ${orderResult.originalProviderId} → ${orderResult.finalProviderId}`,
            );
          }

          console.log(`[Guest Order] eSIM provisioned successfully for order ${order.id}`);

          // 🔥 SEND GUEST EMAILS (Order Confirmation + Installation Instructions)
          try {
            const confirmEmail = await generateOrderConfirmationEmail({
              id: order.id,
              displayId: order.displayOrderId || order.id,
              customerName: user.name || 'Traveler',
              destination: pkg.title || 'eSIM',
              dataAmount: pkg.dataAmount,
              validity: pkg.validity,
              price: order.price,
              iccid: esimDetail?.iccid,
              qrCode: esimDetail?.qrCode,
              qrCodeUrl: esimDetail?.qrCodeUrl,
              lpaCode: esimDetail?.lpaCode,
              smdpAddress: esimDetail?.smdpAddress,
              activationCode: esimDetail?.activationCode,
            });

            await sendEmail({
              to: guestEmail,
              subject: confirmEmail.subject,
              html: confirmEmail.html,
            });

            const installEmail = await generateInstallationEmail({
              name: user.name || 'Traveler',
              packageName: `${pkg.dataAmount} - ${pkg.validity} Days`,
              qrCodeUrl: esimDetail?.qrCodeUrl,
              iccid: esimDetail?.iccid,
              activationCode: esimDetail?.activationCode,
              smdpAddress: esimDetail?.smdpAddress,
              qrCode: esimDetail?.qrCode,
              lpaCode: esimDetail?.lpaCode,
            });

            await sendEmail({
              to: guestEmail,
              subject: installEmail.subject,
              html: installEmail.html,
            });

            await storage.updateOrder(order.id, { installationSent: true });
            console.log(`[Guest Order] 📧 Confirmation & Installation emails sent to ${guestEmail}`);
          } catch (emailError) {
            console.error('[Guest Order] ❌ Email delivery failed:', emailError);
          }

          // Award referral credits to referrer if applicable
          const orderAmount = parseFloat(totalPrice);
          await awardReferralCredits(user.id, order.id, orderAmount);

          // Deduct referral credits if used
          const usedCredits = parseFloat(metadata.referralCredits || '0');
          if (usedCredits > 0 && metadata.userId) {
            try {
              const creditUser = await storage.getUserById(metadata.userId);
              if (creditUser && creditUser.referralBalance) {
                const currentBalance = parseFloat(creditUser.referralBalance);
                const newBalance = Math.max(0, currentBalance - usedCredits);
                await storage.updateUser(metadata.userId, {
                  referralBalance: newBalance.toFixed(2),
                });

                // Log the transaction
                await storage.createReferralTransaction({
                  userId: metadata.userId,
                  orderId: order.id,
                  amount: (-usedCredits).toFixed(2),
                  type: 'credit_used',
                  balanceAfter: newBalance.toFixed(2),
                  balanceBefore: currentBalance.toFixed(2),
                  referralId: metadata.referralId,
                  description: `Used $${usedCredits.toFixed(2)} credits on order ${order.displayOrderId || order.id}`,
                });

                console.log(
                  `[Guest Order] Deducted $${usedCredits} referral credits from user ${metadata.userId}`,
                );
              }
            } catch (creditError: any) {
              console.error(`[Guest Order] Error deducting referral credits:`, creditError.message);
            }
          }

          // Process promo codes (voucher usage or gift card balance deduction)
          if (metadata.promoType && metadata.promoCode) {
            try {
              if (metadata.promoType === 'voucher' && metadata.voucherId) {
                // Track voucher usage
                await storage.incrementVoucherUsage(metadata.voucherId);
                await storage.createVoucherUsage({
                  voucherId: metadata.voucherId,
                  userId: user.id,
                  orderId: order.id,
                  discountAmount: metadata.promoDiscount,
                });
                console.log(
                  `[Guest Order] Voucher ${metadata.promoCode} used for order ${order.id}`,
                );
              } else if (metadata.promoType === 'giftcard' && metadata.giftCardId) {
                // Deduct gift card balance
                const giftCard = await storage.getGiftCardByCode(metadata.promoCode);
                if (giftCard) {
                  const promoDiscount = parseFloat(metadata.promoDiscount || '0');
                  const currentBalance = parseFloat(giftCard.balance);
                  const newBalance = Math.max(0, currentBalance - promoDiscount);

                  await storage.updateGiftCardBalance(metadata.giftCardId, newBalance.toFixed(2));
                  await storage.createGiftCardTransaction({
                    giftCardId: metadata.giftCardId,
                    usedBy: user.id,
                    orderId: order.id,
                    amount: (-promoDiscount).toFixed(2),
                    type: 'redemption',
                    description: `Redeemed $${promoDiscount.toFixed(2)} on order ${order.displayOrderId || order.id}`,
                    balanceAfter: newBalance.toFixed(2),
                  });
                  console.log(
                    `[Guest Order] Gift card ${metadata.promoCode} used: $${promoDiscount} deducted, new balance: $${newBalance.toFixed(2)}`,
                  );
                }
              }
            } catch (promoError: any) {
              console.error(`[Guest Order] Error processing promo code:`, promoError.message);
            }
          }
        } else {
          console.log(
            `[Guest Order] Package ${pkg.id} missing provider info, order ${order.id} left in processing`,
          );
        }
      } catch (providerError: any) {
        console.error(`[Guest Order] Provider error for order ${order.id}:`, providerError.message);
        await storage.updateOrder(order.id, {
          status: 'failed',
        });
      }

      res.json({
        success: true,
        message: 'Order created successfully',
        orderId: order.id,
        guestAccessToken: guestAccessToken,
      });
    } catch (error: any) {
      console.error('Error confirming guest payment:', error);
      res.status(500).json({ success: false, message: 'Error processing order: ' + error.message });
    }
  });

  // Get order by guest access token
  app.get('/api/guest/order/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ success: false, message: 'Access token required' });
      }

      const order = await storage.getOrderByGuestAccessToken(token);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      // Get package details
      const pkg = order.packageId ? await storage.getUnifiedPackageById(order.packageId) : null;

      res.json({
        id: order.id,
        displayOrderId: order.displayOrderId,
        status: order.status,
        dataAmount: order.dataAmount,
        validity: order.validity,
        price: order.price,
        currency: order.currency,
        qrCode: order.qrCode,
        qrCodeUrl: order.qrCodeUrl,
        lpaCode: order.lpaCode,
        smdpAddress: order.smdpAddress,
        activationCode: order.activationCode,
        iccid: order.iccid,
        createdAt: order.createdAt,
        activatedAt: order.activatedAt,
        expiresAt: order.expiresAt,
        usageData: order.usageData,
        guestEmail: order.guestEmail,
        guestPhone: order.guestPhone,
        package: pkg
          ? {
            title: pkg.title,
            countryCode: pkg.countryCode,
            countryName: pkg.countryName,
          }
          : null,
      });
    } catch (error: any) {
      console.error('Error fetching guest order:', error);
      res.status(500).json({ success: false, message: 'Error fetching order' });
    }
  });

  // ==================== STRIPE PAYMENT ROUTES ====================

  // Create payment intent for eSIM package purchase
  // ==================== STRIPE PAYMENT ROUTES ====================

  // Create payment intent for eSIM package purchase (AUTHENTICATED USERS)
  app.post('/api/create-payment-intent', requireAuth, async (req: Request, res: Response) => {
    try {
      const {
        packageId,
        quantity = 1,
        paymentMethodType = 'card',
        requestedCurrency = 'USD',
        promoCode = null,
        promoType = null,
        promoDiscount = 0,
        voucherId = null,
        giftCardId = null,
        referrerId = null,
        referralCredits = 0,
      } = req.body;

      if (!packageId || quantity < 1) {
        return res.status(400).json({ success: false, message: 'Invalid package or quantity' });
      }

      const pkg = await storage.getUnifiedPackageById(packageId);
      if (!pkg) {
        return res.status(404).json({ success: false, message: 'Package not found' });
      }

      // ----------------------------
      // Currency + Retail Price Logic
      // ----------------------------
      const currencies = await storage.getCurrencies();
      const fromCurrency = currencies.find((c) => c.code === 'USD');
      const toCurrency = currencies.find((c) => c.code === requestedCurrency);

      if (!fromCurrency) throw new Error('USD base currency not found');
      if (!toCurrency) throw new Error('Target currency not found');

      const wholesaleUSD = parseFloat(pkg.wholesalePrice);
      const provider = await storage.getProviderById(pkg.providerId);
      const providerMargin = parseFloat(provider.pricingMargin);

      // Base retail in USD
      const baseRetailUSD = wholesaleUSD * (1 + providerMargin / 100);

      // Convert to requested currency
      const fromRate = parseFloat(fromCurrency.conversionRate); // always USD
      const toRate = parseFloat(toCurrency.conversionRate);

      let unitPrice = (baseRetailUSD / fromRate) * toRate;

      // Round properly
      unitPrice = parseFloat(unitPrice.toFixed(2));

      // ----------------------------
      // Quantity
      // ----------------------------
      const validQuantity = Math.max(1, Math.min(10, parseInt(quantity) || 1));
      const subtotal = unitPrice * validQuantity;

      let discount = 0;
      let validatedPromoDiscount = 0;

      // ----------------------------
      // Voucher / Gift / Referral Promo
      // ----------------------------
      if (promoCode && promoType) {
        if (promoType === 'voucher' && voucherId) {
          const voucher = await storage.getVoucherByCode(promoCode);
          if (voucher && voucher.status === 'active') {
            const now = new Date();
            if (now >= new Date(voucher.validFrom) && now <= new Date(voucher.validUntil)) {
              if (voucher.type === 'percentage') {
                validatedPromoDiscount = (subtotal * parseFloat(voucher.value)) / 100;

                if (voucher.maxDiscountAmount) {
                  validatedPromoDiscount = Math.min(
                    validatedPromoDiscount,
                    parseFloat(voucher.maxDiscountAmount),
                  );
                }
              } else {
                validatedPromoDiscount = Math.min(parseFloat(voucher.value), subtotal);
              }
            }
          }
        }

        if (promoType === 'giftcard' && giftCardId) {
          const giftCard = await storage.getGiftCardByCode(promoCode);
          if (giftCard && giftCard.status === 'active') {
            const balance = parseFloat(giftCard.balance);
            validatedPromoDiscount = Math.min(balance, subtotal);
          }
        }

        if (promoType === 'referral' && referrerId) {
          validatedPromoDiscount = Math.min(promoDiscount, subtotal);
        }

        discount += validatedPromoDiscount;
        console.log(
          `[User Checkout] Promo ${promoType} ${promoCode}: ${validatedPromoDiscount.toFixed(2)} ${requestedCurrency} discount`,
        );
      }

      // ----------------------------
      // Referral Credits (Authenticated users)
      // ----------------------------
      let appliedCredits = 0;
      const userId = req.session.userId;

      if (referralCredits > 0 && userId) {
        const user = await storage.getUserById(userId);

        if (user?.referralBalance) {
          const available = parseFloat(user.referralBalance);
          appliedCredits = Math.min(referralCredits, available, subtotal - discount);
          discount += appliedCredits;

          console.log(
            `[User Checkout] Referral credits applied: ${appliedCredits} ${requestedCurrency}`,
          );
        }
      }

      // ----------------------------
      // Final Total
      // ----------------------------
      const total = Math.max(subtotal - discount, 0.5); // minimum 0.50 in selected currency
      const amountInMinor = Math.round(total * 100);

      // ----------------------------
      // Get User Info for Stripe Customer
      // ----------------------------
      const getUser = await storage.getUserById(userId!);

      if (!getUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // ----------------------------
      // Stripe Customer (Required for Indian Stripe accounts)
      // ----------------------------
      const customer = await stripe.customers.create({
        name: getUser.name || 'Customer',
        email: getUser.email,
        phone: getUser.phone || undefined,
        address: {
          line1: getUser.address || undefined,
          city: getUser.address || undefined,
          postal_code: getUser.address || undefined,
          country: 'IN', // Update based on your business location
        },
        metadata: {
          userId: userId!,
        },
      });

      // ----------------------------
      // Payment Intent Parameters
      // ----------------------------
      const paymentIntentParams: any = {
        amount: amountInMinor,
        currency: requestedCurrency.toLowerCase(),
        customer: customer.id, // REQUIRED for Indian export rules
        description: `eSIM Purchase - ${pkg.title} x${validQuantity} (User: ${userId})`,
        metadata: {
          packageId: pkg.id,
          quantity: String(validQuantity),
          userId: userId!,
          type: 'package_purchase',
          paymentMethodType,
          promoCode: promoCode || '',
          promoType: promoType || '',
          promoDiscount: String(validatedPromoDiscount),
          voucherId: voucherId || '',
          giftCardId: giftCardId || '',
          referrerId: referrerId || '',
          referralCredits: String(appliedCredits),
          currency: requestedCurrency,
          unitPrice: String(unitPrice),
          subtotal: String(subtotal),
          total: String(total),
        },
      };

      // Handle payment method types
      if (paymentMethodType === 'paypal') {
        paymentIntentParams.payment_method_types = ['card', 'paypal'];
      } else if (paymentMethodType === 'card') {
        paymentIntentParams.payment_method_types = ['card'];
      }

      // Create Payment Intent
      const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        amount: total,
        currency: requestedCurrency,
        quantity: validQuantity,
        unitPrice,
        subtotal,
        discount,
      });
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      res
        .status(500)
        .json({ success: false, message: 'Error creating payment intent: ' + error.message });
    }
  });

  // Confirm payment and create order (called after successful Stripe payment)
  // app.post("/api/confirm-payment", requireAuth, async (req: Request, res: Response) => {
  //   try {
  //     const { paymentIntentId } = req.body;

  //     if (!paymentIntentId) {
  //       return res.status(400).json({ success: false, message: "Payment intent ID is required" });
  //     }

  //     // Retrieve payment intent from Stripe to verify
  //     const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  //     if (paymentIntent.status !== "succeeded") {
  //       return res.status(400).json({ success: false, message: "Payment not completed" });
  //     }

  //     const metadata = paymentIntent.metadata;

  //     if (metadata.type === "package_purchase") {
  //       // Handle package purchase
  //       const packageId = metadata.packageId;
  //       const quantity = parseInt(metadata.quantity);
  //       const userId = metadata.userId;

  //       if (userId !== req.session.userId) {
  //         return res.status(403).json({ success: false, message: "Payment user mismatch" });
  //       }

  //       // Use package resolver to support both unified and legacy packages
  //       const { resolvePackage, getProviderSpecificPackageId } = await import("./services/packages/package-resolver");
  //       const pkg = await resolvePackage(packageId);

  //       if (!pkg) {
  //         return res.status(404).json({ success: false, message: "Package not found" });
  //       }

  //       // Get price from metadata (already converted and discounted)
  //       const totalPrice = parseFloat(metadata.total);
  //       const unitPrice = parseFloat(metadata.unitPrice);

  //       // Process order
  //       const orderType = quantity === 1 ? "single" : "batch";

  //       if (orderType === "single") {
  //         // Create order with provider metadata
  //         const order = await storage.createOrder({
  //           userId,
  //           packageId: pkg.id,
  //           orderType: "single",
  //           quantity: 1,
  //           status: "processing",
  //           price: totalPrice.toString(),
  //           wholesalePrice: pkg.wholesalePrice?.toString() || null,
  //           currency: metadata.currency || "USD",
  //           orderCurrency: metadata.currency || "USD",
  //           dataAmount: pkg.dataAmount,
  //           validity: pkg.validity,
  //           installationSent: false,
  //           stripePaymentIntentId: paymentIntentId,
  //           providerId: pkg.providerId,
  //           paymentMethod: metadata.paymentMethodType || 'card',
  //         });

  //         console.log("Created order record:", order);

  //         try {
  //           // Trigger eSIM provisioning via OrderingEngine (with smart failover)
  //           if (pkg.isUnified && pkg.providerId) {
  //             const { orderingEngine } = await import("./services/ordering/ordering-engine");

  //             console.log(`[User Order] Provisioning eSIM via OrderingEngine for order ${order.id}`);

  //             // const orderResult = await orderingEngine.createOrder({
  //             //   orderId: order.id,
  //             //   packageId: pkg.id,
  //             //   unifiedPackageId: pkg.id,
  //             //   quantity: 1,
  //             //   customerEmail: req.session.userId ? (await storage.getUserById(req.session.userId))?.email : undefined,
  //             //   source: "user_checkout",
  //             // });

  //             // if (!orderResult.success) {
  //             //   throw new Error(orderResult.error || "Provider order failed");
  //             // }

  //             const providerResponse = await providerService.createOrder({
  //               packageId: providerApiPackageId,
  //               quantity: 1,
  //               customerEmail: req.session.userId ? (await storage.getUserById(req.session.userId))?.email : undefined,
  //               source: "user_checkout",
  //             });

  //             console.log("Provider response:", providerResponse);

  //             const esimDetail = providerResponse.esimDetails?.[0];

  //             // Update order with eSIM details
  //             await storage.updateOrder(order.id, {
  //               providerOrderId: providerResponse.providerOrderId || null,
  //               providerId: providerResponse.finalProviderId,
  //               iccid: esimDetail?.iccid || null,
  //               qrCode: esimDetail?.qrCode || null,
  //               qrCodeUrl: esimDetail?.qrCodeUrl || null,
  //               lpaCode: esimDetail?.lpaCode || esimDetail?.qrCode || null,
  //               smdpAddress: esimDetail?.smdpAddress || null,
  //               activationCode: esimDetail?.activationCode || null,
  //               status: "completed",
  //               originalProviderId: providerResponse.originalProviderId,
  //               finalProviderId: providerResponse.finalProviderId,
  //               failoverAttempts: providerResponse.attempts,
  //             });

  //             // Log if failover was used
  //             if (providerResponse.failoverUsed) {
  //               console.log(`[User Order] Failover used for order ${order.id}: ${providerResponse.originalProviderId} → ${providerResponse.finalProviderId}`);
  //             }

  //             console.log(`[User Order] eSIM provisioned successfully for order ${order.id}`);
  //           }

  //           // Award referral credits to referrer if applicable
  //           await awardReferralCredits(userId, order.id, totalPrice);

  //           // Deduct referral credits if used
  //           const usedCredits = parseFloat(metadata.referralCredits || "0");
  //           if (usedCredits > 0) {
  //             try {
  //               const creditUser = await storage.getUserById(userId);
  //               if (creditUser && creditUser.referralBalance) {
  //                 const currentBalance = parseFloat(creditUser.referralBalance);
  //                 const newBalance = Math.max(0, currentBalance - usedCredits);
  //                 await storage.updateUser(userId, {
  //                   referralBalance: newBalance.toFixed(2)
  //                 });

  //                 // Log the transaction
  //                 await storage.createReferralTransaction({
  //                   userId: metadata.userId,
  //                   orderId: order.id,
  //                   amount: (-usedCredits).toFixed(2),
  //                   type: "credit_used",
  //                   balanceAfter: newBalance.toFixed(2),
  //                   balanceBefore: currentBalance.toFixed(2),
  //                   referralId: metadata.referralId,
  //                   description: `Used $${usedCredits.toFixed(2)} credits on order ${order.displayOrderId || order.id}`,
  //                 });

  //                 console.log(`[User Order] Deducted $${usedCredits} referral credits from user ${userId}`);
  //               }
  //             } catch (creditError: any) {
  //               console.error(`[User Order] Error deducting referral credits:`, creditError.message);
  //             }
  //           }

  //           // Process promo codes (voucher usage or gift card balance deduction)
  //           if (metadata.promoType && metadata.promoCode) {
  //             try {
  //               if (metadata.promoType === "voucher" && metadata.voucherId) {
  //                 await storage.incrementVoucherUsage(metadata.voucherId);
  //                 await storage.createVoucherUsage({
  //                   voucherId: metadata.voucherId,
  //                   userId: userId,
  //                   orderId: order.id,
  //                   discountAmount: metadata.promoDiscount,
  //                 });
  //                 console.log(`[User Order] Voucher ${metadata.promoCode} used for order ${order.id}`);

  //               } else if (metadata.promoType === "giftcard" && metadata.giftCardId) {
  //                 const giftCard = await storage.getGiftCardByCode(metadata.promoCode);
  //                 if (giftCard) {
  //                   const promoDiscount = parseFloat(metadata.promoDiscount || "0");
  //                   const currentBalance = parseFloat(giftCard.balance);
  //                   const newBalance = Math.max(0, currentBalance - promoDiscount);

  //                   await storage.updateGiftCardBalance(metadata.giftCardId, newBalance.toFixed(2));
  //                   await storage.createGiftCardTransaction({
  //                     giftCardId: metadata.giftCardId,
  //                     usedBy: userId,
  //                     orderId: order.id,
  //                     amountUsed: (-promoDiscount).toFixed(2),
  //                     type: "redemption",
  //                     balanceAfter: newBalance.toFixed(2),
  //                     balanceBefore: currentBalance.toFixed(2),
  //                     description: `Redeemed $${promoDiscount.toFixed(2)} on order ${order.displayOrderId || order.id}`,
  //                   });
  //                   console.log(`[User Order] Gift card ${metadata.promoCode} used: $${promoDiscount} deducted, new balance: $${newBalance.toFixed(2)}`);
  //                 }
  //               }
  //             } catch (promoError: any) {
  //               console.error(`[User Order] Error processing promo code:`, promoError.message);
  //             }
  //           }

  //           // Send emails
  //           const user = await storage.getUser(userId);
  //           const destination = pkg.destinationId ? await storage.getDestinationById(pkg.destinationId) : null;

  //           if (user) {
  //             const confirmEmail = await generateOrderConfirmationEmail({
  //               id: order.id,
  //               destination: destination?.name || "Unknown",
  //               dataAmount: pkg.dataAmount,
  //               validity: pkg.validity,
  //               price: totalPrice.toString(),
  //             });

  //             await sendEmail({
  //               to: user.email,
  //               subject: confirmEmail.subject,
  //               html: confirmEmail.html,
  //             });

  //             const installEmail = await generateInstallationEmail({
  //               name: user.name || "Traveler",
  //               packageName: `${pkg.dataAmount} - ${pkg.validity} Days`,
  //               qrCodeUrl: order.qrCodeUrl || "",
  //               iccid: order.iccid || "",
  //               activationCode: order.activationCode || "",
  //               smdpAddress: order.smdpAddress || "",
  //             });

  //             await sendEmail({
  //               to: user.email,
  //               subject: installEmail.subject,
  //               html: installEmail.html,
  //             });

  //             await storage.updateOrder(order.id, { installationSent: true });

  //             // Create in-app notifications
  //             await storage.createNotification({
  //               userId,
  //               type: "installation",
  //               title: "eSIM Ready",
  //               message: `Your eSIM activation code has been sent to ${user.email}. Install it now to stay connected!`,
  //               read: false,
  //               metadata: { orderId: order.id, iccid: order.iccid },
  //             });

  //             console.log(`✅ In-app notification created for user ${user.email}`);
  //           }

  //           await storage.createNotification({
  //             userId,
  //             type: "purchase",
  //             title: "Order Confirmed",
  //             message: `Your order is complete! Check your email for installation instructions.`,
  //             read: false,
  //             metadata: { orderId: order.id },
  //           });

  //           res.json({ success: true, order, message: "Order completed successfully" });
  //         } catch (providerError: any) {
  //           await storage.updateOrder(order.id, { status: "failed" });
  //           throw new Error("Failed to provision eSIM: " + providerError.message);
  //         }
  //       } else {
  //         // Batch order handling
  //         // ... (keep existing batch order logic)
  //         res.json({ success: true, message: "Batch order processing" });
  //       }
  //     } else if (metadata.type === "topup_purchase") {
  //       // Handle top-up purchase (keep existing logic)
  //       res.json({ success: true, message: "Top-up successful" });
  //     } else {
  //       return res.status(400).json({ success: false, message: "Invalid payment type" });
  //     }
  //   } catch (error: any) {
  //     console.error("Error confirming payment:", error);
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // Create payment intent for top-up purchase
  app.post('/api/create-topup-payment-intent', requireAuth, async (req: Request, res: Response) => {
    try {
      const { packageId, iccid, orderId } = req.body;

      if (!packageId || !iccid || !orderId) {
        return res
          .status(400)
          .json({ success: false, message: 'packageId, iccid, and orderId are required' });
      }

      // Verify order belongs to user
      const order = await storage.getOrderById(orderId);
      if (!order || (order.userId !== req.session.userId && !req.session.adminId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const pkg = await storage.getUnifiedPackageById(packageId);
      if (!pkg) {
        return res.status(404).json({ success: false, message: 'Package not found' });
      }

      // Calculate price with top-up margin
      const topupMarginSetting = await storage.getSettingByKey('topup_margin');
      const topupMargin = parseFloat(topupMarginSetting?.value || '40');
      const airaloPrice = pkg.airaloPrice ? parseFloat(pkg.airaloPrice.toString()) : 0;
      const customerPrice = parseFloat((airaloPrice * (1 + topupMargin / 100)).toFixed(2));
      const amountInCents = Math.round(customerPrice * 100);

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd',
        metadata: {
          packageId,
          iccid,
          orderId,
          userId: req.session.userId!,
          type: 'topup_purchase',
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        amount: customerPrice,
        currency: 'USD',
      });
    } catch (error: any) {
      console.error('Error creating top-up payment intent:', error);
      res
        .status(500)
        .json({ success: false, message: 'Error creating payment intent: ' + error.message });
    }
  });

  async function handleReferralAfterOrder({
    referredUserId,
    promoCode,
    orderId,
    orderAmount,
  }: {
    referredUserId: string;
    promoCode: string;
    orderId: string;
    orderAmount: number;
  }) {
    try {
      console.log('[Referral] Start handling referral', {
        referredUserId,
        promoCode,
        orderAmount,
      });

      /* =====================================================
       1️⃣ Get referrer from promoCode
       ===================================================== */
      const [program] = await db
        .select()
        .from(referralProgram)
        .where(eq(referralProgram.referralCode, promoCode))
        .limit(1);

      if (!program) {
        console.log('[Referral] Invalid referral code:', promoCode);
        return;
      }

      const referrerId = program.userId;

      // ❌ Prevent self-referral
      if (referrerId === referredUserId) {
        console.log('[Referral] Self-referral detected, skipping');
        return;
      }

      /* =====================================================
       2️⃣ Get or create referral record
       ===================================================== */
      let [referral] = await db
        .select()
        .from(referrals)
        .where(and(eq(referrals.referrerId, referrerId), eq(referrals.referredId, referredUserId)))
        .limit(1);

      // Signup-time referral miss hua ho to yahin create kar do
      if (!referral) {
        const [created] = await db
          .insert(referrals)
          .values({
            referrerId,
            referredId: referredUserId,
            referralCode: promoCode,
            status: 'pending',
          })
          .returning();

        referral = created;

        console.log('[Referral] Referral record created at order time');
      }

      // ❌ Already rewarded
      if (referral.status === 'completed') {
        console.log('[Referral] Referral already completed, skipping');
        return;
      }

      /* =====================================================
       3️⃣ Load referral settings
       ===================================================== */
      const [settings] = await db.select().from(referralSettings).limit(1);

      if (!settings || !settings.enabled) {
        console.log('[Referral] Referral program disabled');
        return;
      }

      const minOrderAmount = Number(settings.minOrderAmount || 0);
      if (orderAmount < minOrderAmount) {
        console.log(`[Referral] Order amount ${orderAmount} < min ${minOrderAmount}`);
        return;
      }

      /* =====================================================
       4️⃣ Calculate reward for referrer
       ===================================================== */
      let reward = 0;

      if (settings.rewardType === 'percentage') {
        reward = (orderAmount * Number(settings.rewardValue)) / 100;
      } else {
        reward = Number(settings.rewardValue);
      }

      reward = Number(reward.toFixed(2));

      if (reward <= 0) {
        console.log('[Referral] Reward calculated as 0, skipping');
        return;
      }

      /* =====================================================
       5️⃣ Get referrer + balances
       ===================================================== */
      const referrer = await storage.getUser(referrerId);
      if (!referrer) {
        console.log('[Referral] Referrer not found:', referrerId);
        return;
      }

      const balanceBefore = Number(referrer.referralBalance || 0);
      const balanceAfter = Number((balanceBefore + reward).toFixed(2));

      /* =====================================================
       6️⃣ Update referral record → completed
       ===================================================== */
      await db
        .update(referrals)
        .set({
          status: 'completed',
          rewardAmount: reward.toFixed(2),
          rewardPaid: true,
          referredOrderId: orderId,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(referrals.id, referral.id));

      /* =====================================================
       7️⃣ Create referral transaction (LEDGER)
       ===================================================== */
      await db.insert(referralTransactions).values({
        userId: referrerId,
        type: 'credit_earned',
        amount: reward.toFixed(2),
        balanceBefore: balanceBefore.toFixed(2),
        balanceAfter: balanceAfter.toFixed(2),
        referralId: referral.id,
        orderId,
        description: 'Referral reward earned',
      });

      /* =====================================================
       8️⃣ Update referrer cached balance
       ===================================================== */
      await db
        .update(users)
        .set({
          referralBalance: balanceAfter.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(users.id, referrerId));

      /* =====================================================
       9️⃣ Update referral program stats
       ===================================================== */
      await db
        .update(referralProgram)
        .set({
          totalReferrals: sql`${referralProgram.totalReferrals} + 1`,
          totalEarnings: sql`${referralProgram.totalEarnings} + ${reward}`,
          updatedAt: new Date(),
        })
        .where(eq(referralProgram.userId, referrerId));

      console.log(`[Referral] SUCCESS → ${reward} credited to referrer ${referrerId}`);
    } catch (err: any) {
      console.error('[Referral] handleReferralAfterOrder error:', err.message);
    }
  }




  app.post('/api/confirm-payment', async (req: Request, res: Response) => {
    try {
      const { paymentIntentId, providerType, paymentId, signature, metadata: reqMetadata } = req.body;
      const orderId = req.body.orderId || req.body.paypal?.orderId || req.body.paypal?.order_id || req.body.paymentId;

      if (!providerType) {
        return res.status(400).json({ success: false, message: 'providerType missing' });
      }

      let body: any;

      switch (providerType) {
        case 'stripe':
          if (!paymentIntentId)
            return res.status(400).json({ success: false, message: 'paymentIntentId missing' });
          body = { provider: 'stripe', stripe: { paymentIntentId } };
          break;

        case 'razorpay':
          if (!orderId || !paymentId || !signature)
            return res.status(400).json({ success: false, message: 'Razorpay data missing' });
          body = { provider: 'razorpay', razorpay: { orderId, paymentId, signature } };
          break;

        case 'paypal':
          body = { provider: 'paypal', paypal: { orderId } };
          break;

        case 'paystack':
          body = { provider: 'paystack', paystack: { reference: orderId } };
          break;

        case 'yookassa':
          const dbOrderConfirm = await storage.getOrderById(orderId);
          const yookassaPaymentIdConfirm = dbOrderConfirm?.stripePaymentIntentId || dbOrderConfirm?.transactionId || paymentId;
          body = { provider: 'yookassa', yookassa: { orderId, paymentId: yookassaPaymentIdConfirm } };
          break;

        case 'powertranz':
          const { spiToken, orderId: ptOrderId } = req.body;
          if (!spiToken || !ptOrderId)
            return res.status(400).json({
              success: false,
              message: 'PowerTranz data (`spiToken`, `orderId`) missing',
            });
          body = { provider: 'powertranz', powertranz: { spiToken, orderId: ptOrderId } };
          break;

        case 'free':
          body = { provider: 'free', currency: req.body.metadata?.currency || 'USD', metadata: req.body.metadata };
          break;

        case 'midtrans':
          body = {
            provider: 'midtrans',
            midtrans: {
              orderId,
              transactionId: req.body.transactionId || req.body.transaction_id || paymentId,
              statusCode: req.body.statusCode || req.body.status_code,
              transactionStatus: req.body.transactionStatus || req.body.transaction_status,
            },
            orderId,
            amount: req.body.amount,
            currency: req.body.currency,
          };
          break;

        default:
          return res.status(400).json({ success: false, message: 'Unsupported provider' });
      }

      // ── Verify payment ──────────────────────────────────────────────────────
      const baseUrl2 = (process.env.BASE_URL || 'http://127.0.0.1:5000').replace('://localhost', '://127.0.0.1');
      const verifyResponse = await axios.post(
        `${baseUrl2}/api/payments/confirm-payments`,
        body,
      );
      const verification = verifyResponse.data;
      if (!verification.success) return res.status(400).json(verification);

      const metadata = { ...reqMetadata, ...verification.metadata };
      console.log('✅ metadata:', metadata);

      const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND'];

      function normalizePaymentAmount(
        amount: number,
        currency: string,
        provider: string,
      ): number {
        const cur = currency.toUpperCase();
        if (provider === 'stripe' || provider === 'paypal') return amount;
        if (provider === 'razorpay' || provider === 'paystack') {
          return ZERO_DECIMAL_CURRENCIES.includes(cur) ? amount : amount / 100;
        }
        return amount;
      }

      // ════════════════════════════════════════════════════════════════════════
      //  PACKAGE PURCHASE
      // ════════════════════════════════════════════════════════════════════════
      if (metadata.type === 'package_purchase') {
        const packageId = metadata.packageId;
        const quantity = parseInt(metadata.quantity);
        const userId = metadata.userId;

        const { resolvePackage, getProviderSpecificPackageId } =
          await import('./services/packages/package-resolver');

        const pkg = await resolvePackage(packageId);
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        const paidCurrency = verification.currency.toUpperCase();
        const paidAmount = normalizePaymentAmount(
          verification.amount, paidCurrency, verification.provider,
        );
        const totalPrice = paidAmount;
        if ((verification.amount === undefined || verification.amount === null) || isNaN(totalPrice)) throw new Error('Invalid payment amount');

        const orderType = quantity === 1 ? 'single' : 'batch';

        // ── SINGLE ORDER ──────────────────────────────────────────────────────
        if (orderType === 'single') {
          const targetOrderId = metadata?.existingOrderId || metadata?.orderId || orderId || (req.body && req.body.orderId);
          let order = targetOrderId ? await storage.getOrderById(targetOrderId) : null;

          if (order) {
            if (order.status === 'completed' || order.iccid || order.providerOrderId) {
              return res.json({ success: true, order, message: 'Order already completed successfully' });
            }
            if (order.status === 'processing') {
              console.log(`⏳ Order ${order.id} is already in processing state. Waiting for completion...`);
              for (let attempt = 0; attempt < 10; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                const currentOrder = await storage.getOrderById(order.id);
                if (currentOrder && (currentOrder.status === 'completed' || currentOrder.iccid || currentOrder.providerOrderId)) {
                  return res.json({ success: true, order: currentOrder, message: 'Order already completed successfully' });
                }
              }
              return res.json({ success: true, order, message: 'Order is currently processing' });
            }
            order = await storage.updateOrder(order.id, {
              userId: userId || order.userId,
              status: 'processing',
              paymentMethod: metadata.paymentMethodType || verification.paymentMethod || verification.provider || 'card',
              transactionId: verification.transactionId,
              orderCurrency: paidCurrency || 'USD',
              price: totalPrice,
            });
          } else {
            order = await storage.createOrder({
              id: targetOrderId || undefined,
              userId,
              packageId: pkg.id,
              orderType: 'single',
              quantity: 1,
              status: 'processing',
              price: totalPrice,
              airaloPrice: pkg.wholesalePrice,
              currency: verifyResponse.data.currency.toUpperCase(),
              orderCurrency: verifyResponse.data.currency.toUpperCase(),
              dataAmount: pkg.dataAmount,
              validity: pkg.validity,
              installationSent: false,
              stripePaymentIntentId: paymentIntentId,
              providerId: pkg.providerId,
              paymentMethod: metadata.paymentMethodType || verification.paymentMethod || verification.provider || 'card',
              transactionId: verification.transactionId,
            });
          }

          try {
            let orderDetails: any;
            let simDetails: any;

            // ── Provision eSIM ─────────────────────────────────────────────
            if (pkg.providerId && pkg.providerPackageTable && pkg.providerPackageId) {
              const { providerFactory } = await import('./providers/provider-factory');
              const providerService = await providerFactory.getServiceById(pkg.providerId);

              const providerApiPackageId = await getProviderSpecificPackageId(
                pkg.providerPackageTable, pkg.providerPackageId,
              );
              if (!providerApiPackageId) throw new Error('Provider package ID not found');

              const providerResponse = await providerService.createOrder({
                packageId: providerApiPackageId,
                quantity: 1,
                customerRef: `Order ${order.id}`,
              });
              if (!providerResponse.success)
                throw new Error(providerResponse.errorMessage || 'Provider order failed');

              simDetails = {
                iccid: providerResponse.iccid,
                qrCode: providerResponse.qrCode,
                qrCodeUrl: providerResponse.qrCodeUrl || null, // null for some providers
                smdpAddress: providerResponse.smdpAddress,
                activationCode: providerResponse.activationCode,
                lpaCode: providerResponse.qrCode,
                directAppleUrl: null,
                apnType: 'automatic',
                apnValue: null,
                isRoaming: false,
              };
              orderDetails = {
                providerOrderId: providerResponse.providerOrderId,
                requestId: providerResponse.requestId,
              };
            } else if (pkg.airaloId) {
              const airaloResponse = await airaloOrderService.submitSingleOrder(
                pkg.airaloId, 1, `Order ${order.id}`,
              );
              orderDetails = { providerOrderId: airaloResponse.airaloOrderId };
              simDetails = airaloResponse.sims[0];
            } else {
              throw new Error('Invalid package configuration');
            }

            // ── QR Code URL resolution ─────────────────────────────────────
            // Priority 1: provider already gave us a URL → use it directly
            // Priority 2: provider gave no URL but gave lpaCode →
            //             generate PNG, save to /public/qrcodes/, use that URL
            let finalQrUrl: string | null = simDetails?.qrCodeUrl || null;

            if (!finalQrUrl && simDetails?.lpaCode) {
              console.log('⚠️  Provider did not return qrCodeUrl — generating locally...');
              finalQrUrl = await generateAndSaveQrCode(simDetails.lpaCode, order.id);
              // finalQrUrl is now e.g. "https://yourdomain.com/qrcodes/qr_order_42_1234567890.png"
            }

            console.log('📎 Final QR URL for email:', finalQrUrl);

            // ── Persist SIM details ────────────────────────────────────────
            order = await storage.updateOrder(order.id, {
              providerOrderId: orderDetails.providerOrderId,
              airaloOrderId: orderDetails.providerOrderId,
              iccid: simDetails.iccid,
              qrCode: simDetails.qrCode,
              qrCodeUrl: finalQrUrl,           // ← store resolved URL
              lpaCode: simDetails.lpaCode,
              smdpAddress: simDetails.smdpAddress,
              activationCode: simDetails.activationCode,
              directAppleUrl: simDetails.directAppleUrl,
              apnType: simDetails.apnType,
              apnValue: simDetails.apnValue,
              isRoaming: simDetails.isRoaming,
              status: 'completed',
            });

            // ── Referral ───────────────────────────────────────────────────
            if (metadata.promoType === 'referral' && metadata.promoCode) {
              await handleReferralAfterOrder({
                referredUserId: userId,
                promoCode: metadata.promoCode,
                orderId: order.id,
                orderAmount: paidAmount,
              });
            }

            // ── Notifications & Emails ─────────────────────────────────────
            const user = await storage.getUser(order.userId || (userId as string));

            if (user) {
              // 1️⃣ Confirmation email
              const confirmEmail = await generateOrderConfirmationEmail({
                id: order.id,
                destination: pkg.countryName || 'Unknown',
                dataAmount: pkg.dataAmount,
                validity: pkg.validity,
                price: pkg.price,
              });
              await sendEmail({
                to: user.email,
                subject: confirmEmail.subject,
                html: confirmEmail.html,
              });
              console.log('✅ Confirmation email sent');

              // 2️⃣ In-app notification
              await storage.createNotification({
                userId,
                type: 'purchase',
                title: 'Order Confirmed',
                message: 'Your order is complete! Check your email for installation instructions.',
                read: false,
                metadata: { orderId: order.id },
              });

              // 3️⃣ FCM push
              if (user?.fcmToken) {
                try {
                  await adminMessaging.send({
                    notification: {
                      title: 'Order Confirmed',
                      body: `Your ${pkg.dataAmount} eSIM is ready! Check your email for installation instructions.`,
                    },
                    data: { type: 'purchase', orderId: String(order.id) },
                    token: user.fcmToken,
                  });
                } catch (err) {
                  console.error('❌ FCM send error:', err);
                }
              }

              // 4️⃣ Installation email
              if (order.status === 'completed' && !order.installationSent) {
                try {
                  const installationEmail = await generateInstallationEmail({
                    name: user.name || 'Customer',
                    packageName: pkg.name || 'Your eSIM Package',
                    qrCodeUrl: finalQrUrl,                 // ✅ always a real URL or null
                    iccid: simDetails?.iccid,
                    lpaCode: simDetails?.lpaCode,
                    activationCode: simDetails?.activationCode,
                    smdpAddress: simDetails?.smdpAddress,
                  });

                  await sendEmail({
                    to: user.email,
                    subject: installationEmail.subject,
                    html: installationEmail.html,
                    attachments: [],                            // no CID needed
                  });

                  console.log('✅ Installation email sent');
                  await storage.updateOrder(order.id, { installationSent: true });
                } catch (err) {
                  console.error('❌ Installation email error:', err);
                }
              }
            }

            return res.json({ success: true, order, message: 'Order completed successfully' });
          } catch (err: any) {
            await storage.updateOrder(order.id, { status: 'failed' });
            throw new Error('Failed to provision eSIM: ' + err.message);
          }
        }

        // ── BATCH ORDER ───────────────────────────────────────────────────────
        const orderRecords = [];
        let requestId: string;

        if (pkg.airaloId) {
          const batchResult = await airaloOrderService.submitBatchOrder(pkg.airaloId, quantity);
          requestId = batchResult.requestId;
        } else {
          throw new Error('Invalid batch configuration');
        }

        for (let i = 0; i < quantity; i++) {
          const orderRecord = await storage.createOrder({
            userId,
            packageId: pkg.id,
            orderType: 'batch',
            quantity: 1,
            status: 'processing',
            price: pkg.price,
            airaloPrice: pkg.wholesalePrice,
            currency: pkg.currency,
            dataAmount: pkg.dataAmount,
            validity: pkg.validity,
            requestId,
            installationSent: false,
            stripePaymentIntentId: i === 0 ? paymentIntentId : undefined,
            providerId: pkg.providerId,
          });
          orderRecords.push(orderRecord);
        }

        return res.json({
          success: true, orders: orderRecords, requestId, quantity, message: 'Batch order submitted',
        });
      }

      // ════════════════════════════════════════════════════════════════════════
      //  TOPUP PURCHASE
      // ════════════════════════════════════════════════════════════════════════
      if (metadata.type === 'topup_purchase') {
        const { packageId, iccid, orderId, topupId, userId } = metadata;

        if (!orderId || !iccid || !topupId) throw new Error('Missing topup metadata info');

        const order = await storage.getOrderById(orderId);
        if (!order) throw new Error('Order not found');

        const { providerFactory } = await import('./providers/provider-factory');
        const providerService = await providerFactory.getServiceById(order.providerId!);

        let transactionIdForProvider = '';
        if (providerType === 'stripe') transactionIdForProvider = req.body.paymentIntentId;
        else if (providerType === 'razorpay') transactionIdForProvider = req.body.paymentId;
        else if (providerType === 'paypal') transactionIdForProvider = req.body.orderId;
        else if (providerType === 'paystack') transactionIdForProvider = req.body.orderId;
        else if (providerType === 'yookassa') transactionIdForProvider = req.body.paymentId || paymentId;
        if (!transactionIdForProvider) transactionIdForProvider = `TOPUP-${orderId}-${Date.now()}`;

        const transactionId = paymentIntentId || transactionIdForProvider || verification.transactionId;
        if (transactionId) {
          const [existingTopup] = await db
            .select()
            .from(topups)
            .where(eq(topups.stripePaymentIntentId, transactionId));
          if (existingTopup) {
            return res.json({ success: true, topup: existingTopup, message: 'Top-up already processed successfully' });
          }
        }

        const providerResponse = await providerService.purchaseTopup({
          packageId: topupId, quantity: 1, iccid, transactionId: transactionIdForProvider,
        });
        if (!providerResponse.success)
          throw new Error(providerResponse.errorMessage || 'Provider topup purchase failed');

        let topupDataAmount = 'Unknown';
        let topupValidity = 0;
        let airaloPrice = '0';

        try {
          const topupData = await providerService.getTopupPackages(iccid);
          const topupDataAny = topupData as any;
          const packages = Array.isArray(topupDataAny?.data)
            ? topupDataAny.data
            : Array.isArray(topupData) ? topupData : [];

          const selectedTopup = packages.find(
            (p: any) =>
              String(p.id) === String(topupId) ||
              String(p.package_id) === String(topupId) ||
              String(p.providerPackageId) === String(topupId) ||
              String(p.name) === String(topupId),
          );

          if (selectedTopup) {
            topupDataAmount = selectedTopup.data || selectedTopup.dataAmount || 'Unknown';
            topupValidity = selectedTopup.validity || selectedTopup.day || 0;
            const basePrice = selectedTopup.net_price || selectedTopup.wholesalePrice || selectedTopup.price || 0;
            airaloPrice = basePrice.toString();
          }
        } catch (e) {
          console.warn('⚠️ Failed to fetch topup details', e);
        }

        const topup = await storage.createTopup({
          orderId,
          userId: req.session.userId || userId!,
          packageId,
          iccid,
          airaloTopupId: providerResponse.providerOrderId || providerResponse.requestId || 'N/A',
          status: 'completed',
          price: normalizePaymentAmount(
            verification.amount, verification.currency.toUpperCase(), verification.provider,
          ).toString(),
          airaloPrice,
          currency: 'USD',
          dataAmount: String(topupDataAmount),
          validity: Number(topupValidity),
          stripePaymentIntentId: transactionId,
          webhookReceivedAt: new Date(),
        });

        await storage.createNotification({
          userId: req.session.userId || userId!,
          type: 'topup',
          title: 'Top-Up Successful',
          message: `Your eSIM has been topped up with ${topupDataAmount} for ${topupValidity} days.`,
          read: false,
          metadata: { topupId: topup.id, orderId, iccid },
        });

        return res.json({ success: true, topup, message: 'Top-up successful' });
      }

      /* =====================================================
         ================== GIFT CARD ========================
         ===================================================== */
      if (metadata?.type === 'gift_card') {
        const { amount, currency, recipientEmail, recipientName, message, userId } = metadata;

        try {
          const { giftCards } = await import('@shared/schema');
          const code = generateGiftCardCode();

          const [giftCard] = await db.insert(giftCards).values({
            code,
            amount: amount?.toString(),
            currency: currency || 'USD',
            balance: amount?.toString(),
            purchasedBy: userId || req.session?.userId || req.userId,
            recipientEmail: recipientEmail || null,
            recipientName: recipientName || null,
            message: message || null,
            status: 'active',
          }).returning();

          // 🔥 SEND GIFT CARD EMAIL
          try {
            const senderId = userId || req.session?.userId || req.userId;
            let senderName = "A Friend";

            if (senderId) {
              const sender = await storage.getUserById(senderId);
              if (sender?.name) senderName = sender.name;
            }

            const emailData = {
              ...giftCard,
              senderName,
              recipientName: giftCard.recipientName || "Valued Customer",
            };

            const emailContent = await generateGiftCardEmail(emailData);

            await sendEmail({
              to: giftCard.recipientEmail,
              subject: emailContent.subject,
              html: emailContent.html,
            });
            console.log(`✅ Gift card email sent to ${giftCard.recipientEmail}`);
          } catch (emailError) {
            console.error('❌ Gift card email failed but purchase succeeded:', emailError);
          }

          const targetGiftOrderId = metadata?.existingOrderId || metadata?.orderId || orderId || (req.body && req.body.orderId);
          if (targetGiftOrderId) {
            try {
              await storage.updateOrder(targetGiftOrderId, {
                status: 'completed',
                transactionId: verification.transactionId,
              });
            } catch (orderUpdateErr) {
              console.warn('⚠️ Could not update pending gift order:', orderUpdateErr);
            }
          }

          return res.json({
            success: true,
            giftCard,
            message: 'Gift card purchased successfully',
          });
        } catch (error: any) {
          console.error('Error creating gift card:', error);
          return res.status(500).json({ success: false, message: 'Failed to create gift card' });
        }
      }

      /* =====================================================
         ========= IAP PURCHASE (Android / iOS) ==============
         ===================================================== */
      if (metadata?.type === 'iap_purchase') {
        const {
          packageId: iapPackageId,
          userId: iapUserId,
          currency: iapCurrency = 'USD',
          platform: iapPlatform,
          transactionId: iapTransactionId,
        } = metadata;

        if (!iapPackageId || !iapUserId) {
          return res.status(400).json({ success: false, message: 'IAP metadata missing packageId or userId' });
        }

        const { resolvePackage, getProviderSpecificPackageId } =
          await import('./services/packages/package-resolver');

        const pkg = await resolvePackage(iapPackageId);
        if (!pkg) {
          return res.status(404).json({ success: false, message: 'Package not found' });
        }

        // Create order record
        const order = await storage.createOrder({
          userId: iapUserId,
          packageId: pkg.id,
          orderType: 'single',
          quantity: 1,
          status: 'processing',
          price: verification.amount || pkg.price,
          airaloPrice: pkg.wholesalePrice,
          currency: iapCurrency.toUpperCase(),
          orderCurrency: iapCurrency.toUpperCase(),
          dataAmount: pkg.dataAmount,
          validity: pkg.validity,
          installationSent: false,
          paymentMethod: iapPlatform === 'android' ? 'iap-android' : 'iap-ios',
          transactionId: iapTransactionId || verification.referenceId || `iap-${Date.now()}`,
          providerId: pkg.providerId,
        });

        try {
          let simDetails: any;
          let orderDetails: any;

          if (pkg.providerId && pkg.providerPackageTable && pkg.providerPackageId) {
            const { providerFactory } = await import('./providers/provider-factory');
            const providerService = await providerFactory.getServiceById(pkg.providerId);

            const providerApiPackageId = await getProviderSpecificPackageId(
              pkg.providerPackageTable,
              pkg.providerPackageId,
            );
            if (!providerApiPackageId) throw new Error('Provider package ID not found');

            const providerResponse = await providerService.createOrder({
              packageId: providerApiPackageId,
              quantity: 1,
              customerRef: `IAP-Order-${order.id}`,
            });
            if (!providerResponse.success) throw new Error(providerResponse.errorMessage || 'Provider order failed');

            simDetails = {
              iccid: providerResponse.iccid,
              qrCode: providerResponse.qrCode,
              qrCodeUrl: providerResponse.qrCodeUrl,
              smdpAddress: providerResponse.smdpAddress,
              activationCode: providerResponse.activationCode,
              lpaCode: providerResponse.qrCode,
              directAppleUrl: null,
              apnType: 'automatic',
              apnValue: null,
              isRoaming: false,
            };
            orderDetails = { providerOrderId: providerResponse.providerOrderId };

          } else if (pkg.airaloId) {
            const airaloResponse = await airaloOrderService.submitSingleOrder(pkg.airaloId, 1, `IAP-Order-${order.id}`);
            orderDetails = { providerOrderId: airaloResponse.airaloOrderId };
            simDetails = airaloResponse.sims[0];
          } else {
            throw new Error('Invalid package configuration');
          }

          await storage.updateOrder(order.id, {
            providerOrderId: orderDetails.providerOrderId,
            airaloOrderId: orderDetails.providerOrderId,
            iccid: simDetails.iccid,
            qrCode: simDetails.qrCode,
            qrCodeUrl: simDetails.qrCodeUrl,
            lpaCode: simDetails.lpaCode,
            smdpAddress: simDetails.smdpAddress,
            activationCode: simDetails.activationCode,
            directAppleUrl: simDetails.directAppleUrl,
            apnType: simDetails.apnType,
            apnValue: simDetails.apnValue,
            isRoaming: simDetails.isRoaming,
            status: 'completed',
          });

          // Notifications & email
          const iapUser = await storage.getUser(iapUserId);
          if (iapUser) {
            await storage.createNotification({
              userId: iapUserId,
              type: 'purchase',
              title: 'Order Confirmed',
              message: `Your ${pkg.dataAmount} eSIM is ready! You can install it directly from the app.`,
              read: false,
              metadata: { orderId: order.id },
            });

            if (iapUser.fcmToken) {
              try {
                const messaging = await getAdminMessaging();
                await messaging.send({
                  notification: {
                    title: 'Order Confirmed 🎉',
                    body: `Your ${pkg.dataAmount} eSIM is ready! Check your email for installation instructions.`,
                  },
                  data: { type: 'purchase', orderId: String(order.id), click_action: 'FLUTTER_NOTIFICATION_CLICK' },
                  token: iapUser.fcmToken,
                });
              } catch (fcmErr) {
                console.error('[IAP confirm-payment] FCM error:', fcmErr);
              }
            }

            try {
              const confirmEmail = await generateOrderConfirmationEmail({
                id: order.id,
                displayId: order.displayOrderId || order.id,
                customerName: iapUser.name || 'Customer',
                destination: pkg.title || 'eSIM',
                dataAmount: pkg.dataAmount,
                validity: pkg.validity,
                price: order.price,
              });
              await sendEmail({ to: iapUser.email, subject: confirmEmail.subject, html: confirmEmail.html });

              const installEmail = await generateInstallationEmail({
                name: iapUser.name || 'Traveler',
                packageName: `${pkg.dataAmount} - ${pkg.validity} Days`,
                qrCodeUrl: simDetails.qrCodeUrl,
                iccid: simDetails.iccid,
                activationCode: simDetails.activationCode,
                smdpAddress: simDetails.smdpAddress,
                qrCode: simDetails.qrCode,
                lpaCode: simDetails.lpaCode,
              });
              await sendEmail({ to: iapUser.email, subject: installEmail.subject, html: installEmail.html });

              await storage.updateOrder(order.id, { installationSent: true });
            } catch (emailErr) {
              console.error('[IAP confirm-payment] Email error:', emailErr);
            }
          }

          return res.json({ success: true, order, message: 'IAP Order completed successfully' });

        } catch (provisionErr: any) {
          await storage.updateOrder(order.id, { status: 'failed' });
          throw new Error('IAP eSIM provisioning failed: ' + provisionErr.message);
        }
      }

      return res.status(400).json({ success: false, message: 'Invalid payment type' });
    } catch (error: any) {
      console.error('❌ Error confirming payment:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/confirm-payment-old', async (req: Request, res: Response) => {
    try {
      const { paymentIntentId, providerType, orderId, paymentId, signature } = req.body;

      // check verify payment status

      if (!providerType) {
        return res.status(400).json({
          success: false,
          message: 'providerType missing',
        });
      }

      let body: any;

      switch (providerType) {
        case 'stripe':
          if (!paymentIntentId) {
            return res.status(400).json({
              success: false,
              message: 'paymentIntentId missing',
            });
          }

          body = {
            provider: 'stripe',
            stripe: { paymentIntentId },
          };
          break;

        case 'razorpay':
          if (!orderId || !paymentId || !signature) {
            return res.status(400).json({
              success: false,
              message: 'Razorpay data missing',
            });
          }

          body = {
            provider: 'razorpay',
            razorpay: { orderId, paymentId, signature },
          };
          break;

        case 'paypal':
          body = {
            provider: 'paypal',
            paypal: { orderId },
          };
          break;

        case 'paystack':
          body = {
            provider: 'paystack',
            paystack: { reference: orderId },
          };
          break;

        case 'yookassa':
          const dbOrderConfirmOld = await storage.getOrderById(orderId);
          const yookassaPaymentIdConfirmOld = dbOrderConfirmOld?.stripePaymentIntentId || dbOrderConfirmOld?.transactionId || paymentId;
          body = {
            provider: 'yookassa',
            yookassa: { orderId, paymentId: yookassaPaymentIdConfirmOld },
          };
          break;

        case 'powertranz':
          // Extract spiToken and orderId from request for PowerTranz
          const { spiToken, orderId: ptOrderId } = req.body;
          if (!spiToken || !ptOrderId) {
            return res.status(400).json({
              success: false,
              message: 'PowerTranz data (`spiToken`, `orderId`) missing',
            });
          }
          body = {
            provider: 'powertranz',
            powertranz: { spiToken, orderId: ptOrderId },
          };
          break;

        case 'iap-android':
          if (!req.body.purchaseToken || !req.body.productId || !req.body.packageName) {
            return res.status(400).json({ success: false, message: 'IAP Android data missing' });
          }
          body = {
            provider: 'iap-android',
            iap: {
              purchaseToken: req.body.purchaseToken,
              productId: req.body.productId,
              packageName: req.body.packageName,
            },
            // Forward these so confirm-payments can embed them in iap_purchase metadata
            packageId: req.body.packageId,
            userId: req.body.userId || req.userId,
            amount: req.body.amount,
            currency: req.body.currency,
            metadata: {
              ...(req.body.metadata || {}),
              packageId: req.body.packageId,
              userId: req.body.userId || req.userId,
              currency: req.body.currency || 'USD',
            },
          };
          break;

        case 'iap-ios':
          if (!req.body.receiptData) {
            return res.status(400).json({ success: false, message: 'IAP iOS data missing' });
          }
          body = {
            provider: 'iap-ios',
            iap: {
              receiptData: req.body.receiptData,
              productId: req.body.productId,
            },
            // Forward these so confirm-payments can embed them in iap_purchase metadata
            packageId: req.body.packageId,
            userId: req.body.userId || req.userId,
            amount: req.body.amount,
            currency: req.body.currency,
            metadata: {
              ...(req.body.metadata || {}),
              packageId: req.body.packageId,
              userId: req.body.userId || req.userId,
              currency: req.body.currency || 'USD',
            },
          };
          break;

        default:
          return res.status(400).json({
            success: false,
            message: 'Unsupported provider',
          });
      }

      // 🔐 CALL UNIFIED VERIFY API
      const apiBaseUrl2 = (process.env.API_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:5000').replace('://localhost', '://127.0.0.1');
      const verifyResponse = await axios.post(
        `${apiBaseUrl2}/api/payments/confirm-payments`,
        body,
      );

      // console.log("CHEKKKKKKKKKK verification responseee", verifyResponse)
      const verification = verifyResponse.data;

      if (!verification.success) {
        return res.status(400).json(verification);
      }
      // check verify payment status



      const metadata = verification.metadata;
      console.log('CHEKCKK metadata', metadata);


      const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND'];

      function normalizePaymentAmount(
        amount: number,
        currency: string,
        provider: string,
      ): number {
        const cur = currency.toUpperCase();

        // Stripe & PayPal already return decimal amounts
        if (provider === 'stripe' || provider === 'paypal') {
          return amount;
        }

        // Razorpay & Paystack return smallest units
        if (provider === 'razorpay' || provider === 'paystack') {
          if (ZERO_DECIMAL_CURRENCIES.includes(cur)) {
            return amount;
          }
          return amount / 100;
        }

        return amount;
      }

      if (metadata.type === 'package_purchase') {
        const packageId = metadata.packageId;
        const quantity = parseInt(metadata.quantity);
        const userId = metadata.userId;

        // if (userId !== req.userId) {
        //   return res.status(403).json({
        //     success: false,
        //     message: "Payment user mismatch",
        //   });
        // }

        const { resolvePackage, getProviderSpecificPackageId } =
          await import('./services/packages/package-resolver');

        const pkg = await resolvePackage(packageId);

        if (!pkg) {
          return res.status(404).json({
            success: false,
            message: 'Package not found',
          });
        }



        const paidCurrency = verification.currency.toUpperCase();

        const paidAmount = normalizePaymentAmount(
          verification.amount,
          paidCurrency,
          verification.provider,
        );

        //  const totalPrice = (paidAmount * quantity).toString();

        const totalPrice = paidAmount;
        if ((verification.amount === undefined || verification.amount === null) || isNaN(totalPrice)) {
          throw new Error('Invalid Stripe amount');
        }

        const orderType = quantity === 1 ? 'single' : 'batch';

        /* =====================================================
           =============== SINGLE ORDER ========================
           ===================================================== */
        if (orderType === 'single') {
          const order = await storage.createOrder({
            userId,
            packageId: pkg.id,
            orderType: 'single',
            quantity: 1,
            status: 'processing',
            price: totalPrice,
            airaloPrice: pkg.wholesalePrice,
            currency: verifyResponse.data.currency.toUpperCase(),
            orderCurrency: verifyResponse.data.currency.toUpperCase(),
            dataAmount: pkg.dataAmount,
            validity: pkg.validity,
            installationSent: false,
            stripePaymentIntentId: paymentIntentId,
            providerId: pkg.providerId,
            paymentMethod: metadata.paymentMethodType || 'card',
          });

          try {
            let orderDetails: any;
            let simDetails: any;

            if (pkg.providerId && pkg.providerPackageTable && pkg.providerPackageId) {
              const { providerFactory } = await import('./providers/provider-factory');
              const providerService = await providerFactory.getServiceById(pkg.providerId);

              const providerApiPackageId = await getProviderSpecificPackageId(
                pkg.providerPackageTable,
                pkg.providerPackageId,
              );

              if (!providerApiPackageId) {
                throw new Error('Provider package ID not found');
              }

              const providerResponse = await providerService.createOrder({
                packageId: providerApiPackageId,
                quantity: 1,
                customerRef: `Order ${order.id}`,
              });

              if (!providerResponse.success) {
                throw new Error(providerResponse.errorMessage || 'Provider order failed');
              }

              simDetails = {
                iccid: providerResponse.iccid,
                qrCode: providerResponse.qrCode,
                qrCodeUrl: providerResponse.qrCodeUrl,
                smdpAddress: providerResponse.smdpAddress,
                activationCode: providerResponse.activationCode,
                lpaCode: providerResponse.qrCode,
                directAppleUrl: null,
                apnType: 'automatic',
                apnValue: null,
                isRoaming: false,
              };

              orderDetails = {
                providerOrderId: providerResponse.providerOrderId,
                requestId: providerResponse.requestId,
              };
            } else if (pkg.airaloId) {
              const airaloResponse = await airaloOrderService.submitSingleOrder(
                pkg.airaloId,
                1,
                `Order ${order.id}`,
              );
              orderDetails = { providerOrderId: airaloResponse.airaloOrderId };
              simDetails = airaloResponse.sims[0];
            } else {
              throw new Error('Invalid package configuration');
            }

            await storage.updateOrder(order.id, {
              providerOrderId: orderDetails.providerOrderId,
              airaloOrderId: orderDetails.providerOrderId,
              iccid: simDetails.iccid,
              qrCode: simDetails.qrCode,
              qrCodeUrl: simDetails.qrCodeUrl,
              lpaCode: simDetails.lpaCode,
              smdpAddress: simDetails.smdpAddress,
              activationCode: simDetails.activationCode,
              directAppleUrl: simDetails.directAppleUrl,
              apnType: simDetails.apnType,
              apnValue: simDetails.apnValue,
              isRoaming: simDetails.isRoaming,
              status: 'completed',
            });

            const orderPrice = parseFloat(pkg.price.toString());
            // await awardReferralCredits(userId, order.id, orderPrice);

            if (metadata.promoType === 'referral' && metadata.promoCode) {
              await handleReferralAfterOrder({
                referredUserId: userId, // order karne wala
                promoCode: metadata.promoCode, // ATULL5647
                orderId: order.id,
                orderAmount: paidAmount,
              });
            }

            const destination = pkg.destinationId
              ? await storage.getDestinationById(pkg.destinationId)
              : null;

            if (user) {
              const confirmEmail = await generateOrderConfirmationEmail({
                id: order.id,
                destination: destination?.name || 'Unknown',
                dataAmount: pkg.dataAmount,
                validity: pkg.validity,
                price: pkg.price,
              });

              await storage.createNotification({
                userId,
                type: 'purchase',
                title: 'Order Confirmed',
                message: `Your order is complete! You can install your eSIM directly from the app or check your email for confirmation.`,
                read: false,
                metadata: { orderId: order.id },
              });

              const fcmToken = user?.fcmToken;
              if (fcmToken) {
                const payload = {
                  notification: {
                    title: `Order Confirmed`,
                    body: `Your ${pkg.dataAmount} eSIM is ready! Check your email for installation instructions.`,
                  },
                  data: {
                    type: 'purchase', // Matches your in-app notification type
                    orderId: order.id,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK',
                  },
                  token: fcmToken,
                };

                try {
                  const messaging = await getAdminMessaging();
                  await messaging.send(payload);
                  console.log('📱 Notification sent to user:', user.id);
                } catch (err) {
                  console.error('❌ FCM send error:', err);
                }
              }

              await sendEmail({
                to: user.email,
                subject: confirmEmail.subject,
                html: confirmEmail.html,
              });

              // Send separate installation instructions (restored)
              const installEmail = await generateInstallationEmail({
                name: user.name || 'Traveler',
                packageName: `${pkg.dataAmount} - ${pkg.validity} Days`,
                qrCodeUrl: simDetails.qrCodeUrl,
                iccid: simDetails.iccid,
                activationCode: simDetails.activationCode,
                smdpAddress: simDetails.smdpAddress,
                qrCode: simDetails.qrCode,
                lpaCode: simDetails.lpaCode,
              });

              await sendEmail({
                to: user.email,
                subject: installEmail.subject,
                html: installEmail.html,
              });

              await storage.updateOrder(order.id, { installationSent: true });
              console.log(`✅ Order confirmation and installation emails sent to ${user.email}`);
            }

            return res.json({
              success: true,
              order,
              message: 'Order completed successfully',
            });
          } catch (err: any) {
            await storage.updateOrder(order.id, { status: 'failed' });
            throw new Error('Failed to provision eSIM: ' + err.message);
          }
        }

        /* =====================================================
           ================= BATCH ORDER =======================
           ===================================================== */
        const orderRecords = [];
        let requestId: string;

        if (pkg.airaloId) {
          const batchResult = await airaloOrderService.submitBatchOrder(pkg.airaloId, quantity);
          requestId = batchResult.requestId;
        } else {
          throw new Error('Invalid batch configuration');
        }

        for (let i = 0; i < quantity; i++) {
          const orderRecord = await storage.createOrder({
            userId,
            packageId: pkg.id,
            orderType: 'batch',
            quantity: 1,
            status: 'processing',
            price: pkg.price,
            airaloPrice: pkg.wholesalePrice,
            currency: pkg.currency,
            dataAmount: pkg.dataAmount,
            validity: pkg.validity,
            requestId,
            installationSent: false,
            stripePaymentIntentId: i === 0 ? paymentIntentId : undefined,
            providerId: pkg.providerId,
          });
          orderRecords.push(orderRecord);
        }

        return res.json({
          success: true,
          orders: orderRecords,
          requestId,
          quantity,
          message: 'Batch order submitted',
        });
      }

      /* =====================================================
         ================= TOPUP ==============================
         ===================================================== */


      if (metadata.type === 'topup_purchase') {
        const { packageId, iccid, orderId, topupId, userId } = metadata;

        if (!orderId || !iccid || !topupId) {
          throw new Error("Missing topup metadata info");
        }

        const order = await storage.getOrderById(orderId);
        if (!order) throw new Error('Order not found');

        // Initializing provider
        const { providerFactory } = await import('./providers/provider-factory');
        const providerService = await providerFactory.getServiceById(order.providerId!);

        // Determine transaction ID based on provider
        let transactionIdForProvider = '';
        if (providerType === 'stripe') transactionIdForProvider = req.body.paymentIntentId;
        else if (providerType === 'razorpay') transactionIdForProvider = req.body.paymentId;
        else if (providerType === 'paypal') transactionIdForProvider = req.body.orderId;
        else if (providerType === 'paystack') transactionIdForProvider = req.body.orderId;
        else if (providerType === 'yookassa') transactionIdForProvider = req.body.paymentId || paymentId;
        else transactionIdForProvider = `TOPUP-${orderId}-${Date.now()}`;

        if (!transactionIdForProvider) {
          transactionIdForProvider = `TOPUP-${orderId}-${Date.now()}`;
        }

        const transactionId = paymentIntentId || transactionIdForProvider || verification.transactionId;
        if (transactionId) {
          const [existingTopup] = await db
            .select()
            .from(topups)
            .where(eq(topups.stripePaymentIntentId, transactionId));
          if (existingTopup) {
            return res.json({ success: true, topup: existingTopup, message: 'Top-up already processed successfully' });
          }
        }

        // Purchase the topup
        const providerResponse = await providerService.purchaseTopup({
          packageId: topupId,
          quantity: 1,
          iccid,
          transactionId: transactionIdForProvider
        });

        if (!providerResponse.success) {
          throw new Error(providerResponse.errorMessage || 'Provider topup purchase failed');
        }

        // Fetch top-up package details to record correct info
        let topupDataAmount = "Unknown";
        let topupValidity = 0;
        let airaloPrice = "0";

        try {
          const topupData = await providerService.getTopupPackages(iccid);
          const topupDataAny = topupData as any;
          const packages = Array.isArray(topupDataAny?.data)
            ? topupDataAny.data
            : Array.isArray(topupData)
              ? topupData
              : [];

          const selectedTopup = packages.find((p: any) =>
            String(p.id) === String(topupId) ||
            String(p.package_id) === String(topupId) ||
            String(p.providerPackageId) === String(topupId) ||
            String(p.name) === String(topupId)
          );

          if (selectedTopup) {
            topupDataAmount = selectedTopup.data || selectedTopup.dataAmount || "Unknown";
            topupValidity = selectedTopup.validity || selectedTopup.day || 0;
            const basePrice = selectedTopup.net_price || selectedTopup.wholesalePrice || selectedTopup.price || 0;
            airaloPrice = basePrice.toString();
          }
        } catch (e) {
          console.warn("Failed to fetch topup details for DB record", e);
        }

        // Create topup record
        const topup = await storage.createTopup({
          orderId,
          userId: req.session.userId || userId!,
          packageId, // Links to original unified package
          iccid,
          airaloTopupId: providerResponse.providerOrderId || providerResponse.requestId || "N/A",
          status: 'completed',
          price: normalizePaymentAmount(
            verification.amount,
            verification.currency.toUpperCase(),
            verification.provider
          ).toString(),

          airaloPrice: airaloPrice,
          currency: 'USD',
          dataAmount: String(topupDataAmount),
          validity: Number(topupValidity),
          stripePaymentIntentId: transactionId,
          webhookReceivedAt: new Date(),
        });

        // Create in-app notification
        await storage.createNotification({
          userId: req.session.userId || userId!,
          type: 'topup',
          title: 'Top-Up Successful',
          message: `Your eSIM has been topped up with ${topupDataAmount} for ${topupValidity} days.`,
          read: false,
          metadata: { topupId: topup.id, orderId, iccid },
        });

        return res.json({
          success: true,
          topup,
          message: 'Top-up successful',
        });
      }

      /* =====================================================
         ================== GIFT CARD ========================
         ===================================================== */
      if (metadata?.type === 'gift_card') {
        const { amount, currency, recipientEmail, recipientName, message, userId } = metadata;

        try {
          const { giftCards } = await import('@shared/schema');
          const code = generateGiftCardCode();

          const [giftCard] = await db.insert(giftCards).values({
            code,
            amount: amount?.toString(),
            currency: currency || 'USD',
            balance: amount?.toString(),
            purchasedBy: userId || req.session?.userId || req.userId,
            recipientEmail: recipientEmail || null,
            recipientName: recipientName || null,
            message: message || null,
            status: 'active',
          }).returning();

          // 🔥 SEND GIFT CARD EMAIL
          try {
            const senderId = userId || req.session?.userId || req.userId;
            let senderName = "A Friend";

            if (senderId) {
              const sender = await storage.getUserById(senderId);
              if (sender?.name) senderName = sender.name;
            }

            const emailData = {
              ...giftCard,
              senderName,
              recipientName: giftCard.recipientName || "Valued Customer",
            };

            const emailContent = await generateGiftCardEmail(emailData);

            await sendEmail({
              to: giftCard.recipientEmail,
              subject: emailContent.subject,
              html: emailContent.html,
            });
            console.log(`✅ Gift card email sent to ${giftCard.recipientEmail}`);
          } catch (emailError) {
            console.error('❌ Gift card email failed but purchase succeeded:', emailError);
          }

          return res.json({
            success: true,
            giftCard,
            message: 'Gift card purchased successfully',
          });
        } catch (error: any) {
          console.error('Error creating gift card:', error);
          return res.status(500).json({ success: false, message: 'Failed to create gift card' });
        }
      }

      /* =====================================================
         ========= IAP PURCHASE (Android / iOS) ==============
         =====================================================
         When providerType is 'iap-android' or 'iap-ios' the
         verify step (confirm-payments) already ran above and
         returned verification.metadata = { type:'iap_purchase', ... }.
         We now create the order and provision the eSIM.
         ===================================================== */
      if (metadata?.type === 'iap_purchase') {
        const {
          packageId: iapPackageId,
          userId: iapUserId,
          currency: iapCurrency = 'USD',
          platform: iapPlatform,
          transactionId: iapTransactionId,
        } = metadata;

        if (!iapPackageId || !iapUserId) {
          return res.status(400).json({ success: false, message: 'IAP metadata missing packageId or userId' });
        }

        const { resolvePackage, getProviderSpecificPackageId } =
          await import('./services/packages/package-resolver');

        const pkg = await resolvePackage(iapPackageId);
        if (!pkg) {
          return res.status(404).json({ success: false, message: 'Package not found' });
        }

        // Create order record
        const order = await storage.createOrder({
          userId: iapUserId,
          packageId: pkg.id,
          orderType: 'single',
          quantity: 1,
          status: 'processing',
          price: verification.amount || pkg.price,
          airaloPrice: pkg.wholesalePrice,
          currency: iapCurrency.toUpperCase(),
          orderCurrency: iapCurrency.toUpperCase(),
          dataAmount: pkg.dataAmount,
          validity: pkg.validity,
          installationSent: false,
          paymentMethod: iapPlatform === 'android' ? 'iap-android' : 'iap-ios',
          transactionId: iapTransactionId || verification.referenceId || `iap-${Date.now()}`,
          providerId: pkg.providerId,
        });

        try {
          let simDetails: any;
          let orderDetails: any;

          if (pkg.providerId && pkg.providerPackageTable && pkg.providerPackageId) {
            const { providerFactory } = await import('./providers/provider-factory');
            const providerService = await providerFactory.getServiceById(pkg.providerId);

            const providerApiPackageId = await getProviderSpecificPackageId(
              pkg.providerPackageTable,
              pkg.providerPackageId,
            );
            if (!providerApiPackageId) throw new Error('Provider package ID not found');

            const providerResponse = await providerService.createOrder({
              packageId: providerApiPackageId,
              quantity: 1,
              customerRef: `IAP-Order-${order.id}`,
            });
            if (!providerResponse.success) throw new Error(providerResponse.errorMessage || 'Provider order failed');

            simDetails = {
              iccid: providerResponse.iccid,
              qrCode: providerResponse.qrCode,
              qrCodeUrl: providerResponse.qrCodeUrl,
              smdpAddress: providerResponse.smdpAddress,
              activationCode: providerResponse.activationCode,
              lpaCode: providerResponse.qrCode,
              directAppleUrl: null,
              apnType: 'automatic',
              apnValue: null,
              isRoaming: false,
            };
            orderDetails = { providerOrderId: providerResponse.providerOrderId };

          } else if (pkg.airaloId) {
            const airaloResponse = await airaloOrderService.submitSingleOrder(pkg.airaloId, 1, `IAP-Order-${order.id}`);
            orderDetails = { providerOrderId: airaloResponse.airaloOrderId };
            simDetails = airaloResponse.sims[0];
          } else {
            throw new Error('Invalid package configuration');
          }

          await storage.updateOrder(order.id, {
            providerOrderId: orderDetails.providerOrderId,
            airaloOrderId: orderDetails.providerOrderId,
            iccid: simDetails.iccid,
            qrCode: simDetails.qrCode,
            qrCodeUrl: simDetails.qrCodeUrl,
            lpaCode: simDetails.lpaCode,
            smdpAddress: simDetails.smdpAddress,
            activationCode: simDetails.activationCode,
            directAppleUrl: simDetails.directAppleUrl,
            apnType: simDetails.apnType,
            apnValue: simDetails.apnValue,
            isRoaming: simDetails.isRoaming,
            status: 'completed',
          });

          // Notifications & email
          const iapUser = await storage.getUser(iapUserId);
          if (iapUser) {
            await storage.createNotification({
              userId: iapUserId,
              type: 'purchase',
              title: 'Order Confirmed',
              message: `Your ${pkg.dataAmount} eSIM is ready! You can install it directly from the app.`,
              read: false,
              metadata: { orderId: order.id },
            });

            if (iapUser.fcmToken) {
              try {
                const messaging = await getAdminMessaging();
                await messaging.send({
                  notification: {
                    title: 'Order Confirmed 🎉',
                    body: `Your ${pkg.dataAmount} eSIM is ready! Check your email for installation instructions.`,
                  },
                  data: { type: 'purchase', orderId: order.id, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
                  token: iapUser.fcmToken,
                });
              } catch (fcmErr) {
                console.error('[IAP confirm-payment] FCM error:', fcmErr);
              }
            }

            try {
              // Logged-in user (IAP) only receives order confirmation without SIM details
              const confirmEmail = await generateOrderConfirmationEmail({
                id: order.id,
                displayId: order.displayOrderId || order.id,
                customerName: iapUser.name || 'Customer',
                destination: pkg.title || 'eSIM',
                dataAmount: pkg.dataAmount,
                validity: pkg.validity,
                price: order.price,
                // iccid/qrCode etc explicitly omitted to satisfy "loggedin user not recieve sim info"
              });
              await sendEmail({ to: iapUser.email, subject: confirmEmail.subject, html: confirmEmail.html });
              console.log('[IAP Confirm] 📧 Order confirmation sent to:', iapUser.email);

              // Restoring installation instructions for logged-in users per feedback
              const installEmail = await generateInstallationEmail({
                name: iapUser.name || 'Traveler',
                packageName: `${pkg.dataAmount} - ${pkg.validity} Days`,
                qrCodeUrl: simDetails.qrCodeUrl,
                iccid: simDetails.iccid,
                activationCode: simDetails.activationCode,
                smdpAddress: simDetails.smdpAddress,
                qrCode: simDetails.qrCode,
                lpaCode: simDetails.lpaCode,
              });
              await sendEmail({ to: iapUser.email, subject: installEmail.subject, html: installEmail.html });
              console.log('[IAP Confirm] 📧 Installation instructions sent to:', iapUser.email);

              await storage.updateOrder(order.id, { installationSent: true });
            } catch (emailErr) {
              console.error('[IAP confirm-payment] Email error:', emailErr);
            }
          }

          return res.json({ success: true, order, message: 'IAP Order completed successfully' });

        } catch (provisionErr: any) {
          await storage.updateOrder(order.id, { status: 'failed' });
          throw new Error('IAP eSIM provisioning failed: ' + provisionErr.message);
        }
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid payment type',
      });
    } catch (error: any) {
      console.error('Error confirming payment:', error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  // ==================== AUTH ROUTES ====================

  app.use('/api/auth', authRouter);
  app.use('/api/destinations', destinationsRouter);
  app.use('/api/regions', regionsRouter);
  app.use('/api/packages', packagesRouter);
  app.use('/api/unified-packages', unifiedPackagesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/customer', customerRouter);
  app.use('/api/contact', contactRouter);
  app.use('/api/customer/tickets', tickets);
  app.use('/api/banner', bannerRouter);
  app.use('/api/pages', pagesRouter);
  app.use('/api/faqs', faqsRouter);
  app.use('/api/payments', PaymentsRouter);
  app.use('/api/iap', IapRouter); // 📱 Dedicated In-App Purchase (iOS / Android) routes

  // admin routes

  app.use('/api/admin', adminRoutes);

  // External API v1 for partners and mobile apps
  app.use('/api/v1', apiV1Router);

  app.delete('/api/user/account/:userId', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;

      // Check user exists
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Soft delete (recommended)
      // await db
      //   .update(users)
      //   .set({
      //     isDeleted: true,
      //     deletionRequestedAt: new Date(),
      //   })
      //   .where(eq(users.id, userId));

      // Optional: invalidate tokens / sessions here

      return res.json({
        success: true,
        message:
          'Your account deletion request has been received. Your account will be permanently deleted within 7 days.',
      });
    } catch (error) {
      console.error('Delete account error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // ==================== SEO ====================

  app.get('/robots.txt', (req: Request, res: Response) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
  });

  app.get('/sitemap.xml', async (req: Request, res: Response) => {
    try {
      const destinations = await storage.getAllDestinations();
      const packages = await storage.getAllPackages();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const urls = [
        { loc: baseUrl, priority: '1.0', changefreq: 'daily' },
        { loc: `${baseUrl}/destinations`, priority: '0.9', changefreq: 'weekly' },
        { loc: `${baseUrl}/compatible-devices`, priority: '0.7', changefreq: 'monthly' },
        { loc: `${baseUrl}/support`, priority: '0.6', changefreq: 'monthly' },
      ];

      // Add destination pages
      for (const dest of destinations) {
        urls.push({
          loc: `${baseUrl}/destination/${dest.slug}`,
          priority: '0.8',
          changefreq: 'weekly',
        });
      }

      // Add package pages
      for (const pkg of packages) {
        if (pkg.slug) {
          urls.push({
            loc: `${baseUrl}/packages/${pkg.slug}`,
            priority: '0.7',
            changefreq: 'weekly',
          });
        }
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
          .map(
            (url) => `  <url>
    <loc>${url.loc}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
          )
          .join('\n')}
</urlset>`;

      res.type('application/xml');
      res.send(xml);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== DESTINATIONS & REGIONS ====================

  // ==================== PACKAGES ====================

  app.get('/api/packages', async (req: Request, res: Response) => {
    try {
      const packages = await storage.getAllPackages();

      // Get current margin setting
      const marginSetting = await storage.getSettingByKey('pricing_margin');
      const marginPercent = marginSetting ? parseFloat(marginSetting.value) : 0;

      const packagesWithDestinations = await Promise.all(
        packages.map(async (pkg) => {
          // Calculate customer price based on current margin
          const airaloPrice = pkg.airaloPrice ? parseFloat(pkg.airaloPrice) : parseFloat(pkg.price);
          const customerPrice = airaloPrice * (1 + marginPercent / 100);

          const packageWithPrice = {
            ...pkg,
            airaloPrice: airaloPrice.toFixed(2),
            price: customerPrice.toFixed(2),
          };

          if (pkg.destinationId) {
            const destination = await storage.getDestinationById(pkg.destinationId);
            return { ...packageWithPrice, destination };
          }
          return packageWithPrice;
        }),
      );

      ApiResponse.success(res, 'Packages retrieved successfully', packagesWithDestinations);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/packages/featured', async (req: Request, res: Response) => {
    try {
      const packages = await storage.getFeaturedPackages();

      const packagesWithDestinations = await Promise.all(
        packages.map(async (pkg) => {
          let destination = null;
          if (pkg.destinationId) {
            destination = await storage.getDestinationById(pkg.destinationId);
          }
          return {
            id: pkg.id,
            title: pkg.title,
            slug: pkg.slug,
            dataAmount: pkg.dataAmount,
            validity: pkg.validityDays || pkg.validity,
            retailPrice: pkg.retailPrice,
            price: pkg.retailPrice,
            currency: pkg.currency || 'USD',
            destinationId: pkg.destinationId,
            regionId: pkg.regionId,
            destination: destination
              ? {
                id: destination.id,
                name: destination.name,
                countryCode: destination.countryCode,
                slug: destination.slug,
              }
              : null,
          };
        }),
      );

      ApiResponse.success(res, 'Packages retrieved successfully', packagesWithDestinations);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/packages/slug/:slug', async (req: Request, res: Response) => {
    try {
      const pkg = await storage.getPackageBySlug(req.params.slug);
      if (!pkg) {
        return res.status(404).json({ success: false, message: 'Package not found' });
      }

      let destination;
      if (pkg.destinationId) {
        destination = await storage.getDestinationById(pkg.destinationId);
      }

      res.json({ ...pkg, destination });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get unified packages (multi-provider) with provider information
  app.get('/api/unified-packages', async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'public, max-age=300');
      const requestedCurrency = (req.query.currency as string) || 'USD';

      const unifiedPackagesData = await db.query.unifiedPackages.findMany({
        where: (unifiedPackages, { eq }) => eq(unifiedPackages.isEnabled, true), // Only enabled packages
        with: {
          provider: true, // Include provider info
          destination: true, // Include destination for display
          region: true, // Include region if applicable
        },
      });

      // Get currency rates for conversion
      const currencies = await storage.getCurrencies();
      const fromCurrency = currencies.find((c) => c.code === 'USD');
      const toCurrency = currencies.find((c) => c.code === requestedCurrency);

      // Filter to only show packages from enabled providers
      const packagesFromEnabledProviders = unifiedPackagesData.filter(
        (pkg) => pkg.provider && pkg.provider.enabled,
      );

      // Map to frontend-friendly format with dynamically calculated prices
      const formattedPackages = packagesFromEnabledProviders.map((pkg) => {
        // Calculate retail price dynamically from current provider margin
        const wholesalePrice = parseFloat(pkg.wholesalePrice);
        const providerMargin = parseFloat(pkg.provider.pricingMargin);
        let retailPrice = wholesalePrice * (1 + providerMargin / 100);

        // Convert price if needed
        if (requestedCurrency !== 'USD' && fromCurrency && toCurrency) {
          const fromRate = parseFloat(fromCurrency.conversionRate);
          const toRate = parseFloat(toCurrency.conversionRate);
          retailPrice = (retailPrice / fromRate) * toRate;
        }

        return {
          id: pkg.id,
          slug: pkg.slug,
          title: pkg.title,
          dataAmount: pkg.dataAmount,
          validity: pkg.validity,
          price: retailPrice.toFixed(2), // Customer-facing price (calculated dynamically)
          wholesalePrice: pkg.wholesalePrice,
          currency: requestedCurrency,
          type: pkg.type,
          isUnlimited: pkg.isUnlimited,
          isBestPrice: pkg.isBestPrice,
          isPopular: pkg.isPopular,
          isTrending: pkg.isTrending,
          isRecommended: pkg.isRecommended,
          isBestValue: pkg.isBestValue,
          isEnabled: pkg.isEnabled,

          // Provider information
          providerId: pkg.providerId,
          providerName: pkg.provider.name,
          providerSlug: pkg.provider.slug,

          // Location information
          destinationId: pkg.destinationId,
          destination: pkg.destination,
          regionId: pkg.regionId,
          region: pkg.region,

          // Package features
          operator: pkg.operator,
          operatorImage: pkg.operatorImage,
          coverage: pkg.coverage,

          // Additional metadata
          providerPackageTable: pkg.providerPackageTable,
          providerPackageId: pkg.providerPackageId,
        };
      });

      ApiResponse.success(res, 'Packages retrieved successfully', formattedPackages);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get a single unified package by slug
  app.get('/api/unified-packages/slug/:slug', async (req: Request, res: Response) => {
    try {
      const requestedCurrency = (req.query.currency as string) || 'USD';

      console.log('requestedCurrency', requestedCurrency)

      const [pkg] = await db.query.unifiedPackages.findMany({
        where: (unifiedPackages, { eq, and }) =>
          and(eq(unifiedPackages.slug, req.params.slug), eq(unifiedPackages.isEnabled, true)),
        with: {
          provider: true,
          destination: true,
          region: true,
        },
        limit: 1,
      });

      console.log(pkg)

      if (!pkg || !pkg.provider || !pkg.provider.enabled) {
        return res.status(404).json({ success: false, message: 'Package not found' });
      }

      // Get currency rates for conversion
      const currencies = await storage.getCurrencies();
      const fromCurrency = currencies.find((c) => c.code === 'USD');
      const toCurrency = currencies.find((c) => c.code === requestedCurrency);

      // Calculate retail price dynamically from current provider margin
      const wholesalePrice = parseFloat(pkg.wholesalePrice);
      const providerMargin = parseFloat(pkg.provider.pricingMargin);
      let retailPrice = wholesalePrice * (1 + providerMargin / 100);

      // Convert price if needed
      if (requestedCurrency !== 'USD' && fromCurrency && toCurrency) {
        const fromRate = parseFloat(fromCurrency.conversionRate);
        const toRate = parseFloat(toCurrency.conversionRate);
        retailPrice = (retailPrice / fromRate) * toRate;
      }

      const formattedPackage = {
        id: pkg.id,
        slug: pkg.slug,
        title: pkg.title,
        dataAmount: pkg.dataAmount,
        validity: pkg.validity,
        type: pkg.type,
        price: retailPrice.toFixed(2),
        wholesalePrice: pkg.wholesalePrice,
        currency: requestedCurrency,
        isUnlimited: pkg.isUnlimited,
        isBestPrice: pkg.isBestPrice,

        // Provider information
        providerId: pkg.providerId,
        providerName: pkg.provider.name,
        providerSlug: pkg.provider.slug,

        // Location information
        destinationId: pkg.destinationId,
        destination: pkg.destination,
        regionId: pkg.regionId,
        region: pkg.region,

        // Package features
        operator: pkg.operator,
        operatorImage: pkg.operatorImage,
        coverage: pkg.coverage,
        voiceCredits: pkg.voiceCredits,
        smsCredits: pkg.smsCredits,

        // Tags
        isPopular: pkg.isPopular,
        isTrending: pkg.isTrending,
        isRecommended: pkg.isRecommended,
        isBestValue: pkg.isBestValue,

        // Additional metadata
        providerPackageTable: pkg.providerPackageTable,
        providerPackageId: pkg.providerPackageId,
        customImage: pkg.customImage,
        customDescription: pkg.customDescription,
      };

      ApiResponse.success(res, 'Package retrieved successfully', formattedPackage);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Search endpoint with filters and sorting
  app.get('/api/search', async (req: Request, res: Response) => {
    try {
      const {
        q = '', // search query
        minPrice,
        maxPrice,
        minData,
        maxData,
        minValidity,
        maxValidity,
        type,
        destinationId,
        regionId,
        sortBy = 'default', // default, price_asc, price_desc, data_asc, data_desc, validity_asc, validity_desc, popularity
        currency: requestedCurrency = 'USD',
      } = req.query;

      // Build where conditions
      const conditions: any[] = [
        eq(unifiedPackages.isEnabled, true), // Only enabled packages
      ];

      // Search query - search in title and operator fields
      if (q && typeof q === 'string' && q.trim()) {
        conditions.push(
          or(ilike(unifiedPackages.title, `%${q}%`), ilike(unifiedPackages.operator, `%${q}%`)),
        );
      }

      // Package type filter
      if (type && typeof type === 'string') {
        conditions.push(eq(unifiedPackages.type, type));
      }

      // Destination filter
      if (destinationId && typeof destinationId === 'string') {
        conditions.push(eq(unifiedPackages.destinationId, destinationId));
      }

      // Region filter
      if (regionId && typeof regionId === 'string') {
        conditions.push(eq(unifiedPackages.regionId, regionId));
      }

      // Data range filter (in MB)
      if (minData && typeof minData === 'string') {
        const minDataMb = parseInt(minData);
        if (!isNaN(minDataMb)) {
          conditions.push(
            or(
              gte(unifiedPackages.dataMb, minDataMb),
              eq(unifiedPackages.isUnlimited, true), // Include unlimited packages
            ),
          );
        }
      }

      if (maxData && typeof maxData === 'string') {
        const maxDataMb = parseInt(maxData);
        if (!isNaN(maxDataMb)) {
          conditions.push(
            or(
              lte(unifiedPackages.dataMb, maxDataMb),
              eq(unifiedPackages.isUnlimited, true), // Include unlimited packages
            ),
          );
        }
      }

      // Validity range filter (in days)
      if (minValidity && typeof minValidity === 'string') {
        const minValidityDays = parseInt(minValidity);
        if (!isNaN(minValidityDays)) {
          conditions.push(gte(unifiedPackages.validityDays, minValidityDays));
        }
      }

      if (maxValidity && typeof maxValidity === 'string') {
        const maxValidityDays = parseInt(maxValidity);
        if (!isNaN(maxValidityDays)) {
          conditions.push(lte(unifiedPackages.validityDays, maxValidityDays));
        }
      }

      // Fetch packages with filters
      const packagesData = await db.query.unifiedPackages.findMany({
        where: and(...conditions),
        with: {
          provider: true,
          destination: true,
          region: true,
        },
      });

      // Get currency rates for conversion
      const currencies = await storage.getCurrencies();
      const fromCurrency = currencies.find((c) => c.code === 'USD');
      const toCurrency = currencies.find((c) => c.code === requestedCurrency);

      // Filter to only show packages from enabled providers
      const packagesFromEnabledProviders = packagesData.filter(
        (pkg) => pkg.provider && pkg.provider.enabled,
      );

      // Calculate prices and format packages
      let formattedPackages = packagesFromEnabledProviders.map((pkg) => {
        // Calculate retail price dynamically from current provider margin
        const wholesalePrice = parseFloat(pkg.wholesalePrice);
        const providerMargin = parseFloat(pkg.provider.pricingMargin);
        let retailPrice = wholesalePrice * (1 + providerMargin / 100);

        // Convert price if needed
        if (requestedCurrency !== 'USD' && fromCurrency && toCurrency) {
          const fromRate = parseFloat(fromCurrency.conversionRate);
          const toRate = parseFloat(toCurrency.conversionRate);
          retailPrice = (retailPrice / fromRate) * toRate;
        }

        return {
          id: pkg.id,
          slug: pkg.slug,
          title: pkg.title,
          dataAmount: pkg.dataAmount,
          validity: pkg.validity,
          price: retailPrice.toFixed(2),
          priceNumeric: retailPrice, // For sorting
          wholesalePrice: pkg.wholesalePrice,
          currency: requestedCurrency,
          type: pkg.type,
          isUnlimited: pkg.isUnlimited,
          isBestPrice: pkg.isBestPrice,
          isPopular: pkg.isPopular,
          isTrending: pkg.isTrending,
          isRecommended: pkg.isRecommended,
          isBestValue: pkg.isBestValue,
          isEnabled: pkg.isEnabled,
          salesCount: pkg.salesCount,
          dataMb: pkg.dataMb,
          validityDays: pkg.validityDays,

          // Provider information
          providerId: pkg.providerId,
          providerName: pkg.provider.name,
          providerSlug: pkg.provider.slug,

          // Location information
          destinationId: pkg.destinationId,
          destination: pkg.destination,
          regionId: pkg.regionId,
          region: pkg.region,

          // Package features
          operator: pkg.operator,
          operatorImage: pkg.operatorImage,
          coverage: pkg.coverage,
        };
      });

      // Apply price range filter after currency conversion
      if (minPrice && typeof minPrice === 'string') {
        const minPriceNum = parseFloat(minPrice);
        if (!isNaN(minPriceNum)) {
          formattedPackages = formattedPackages.filter((pkg) => pkg.priceNumeric >= minPriceNum);
        }
      }

      if (maxPrice && typeof maxPrice === 'string') {
        const maxPriceNum = parseFloat(maxPrice);
        if (!isNaN(maxPriceNum)) {
          formattedPackages = formattedPackages.filter((pkg) => pkg.priceNumeric <= maxPriceNum);
        }
      }

      // Apply sorting
      switch (sortBy) {
        case 'price_asc':
          formattedPackages.sort((a, b) => a.priceNumeric - b.priceNumeric);
          break;
        case 'price_desc':
          formattedPackages.sort((a, b) => b.priceNumeric - a.priceNumeric);
          break;
        case 'data_asc':
          formattedPackages.sort((a, b) => {
            if (a.isUnlimited && !b.isUnlimited) return 1;
            if (!a.isUnlimited && b.isUnlimited) return -1;
            if (a.isUnlimited && b.isUnlimited) return 0;
            return (a.dataMb || 0) - (b.dataMb || 0);
          });
          break;
        case 'data_desc':
          formattedPackages.sort((a, b) => {
            if (a.isUnlimited && !b.isUnlimited) return -1;
            if (!a.isUnlimited && b.isUnlimited) return 1;
            if (a.isUnlimited && b.isUnlimited) return 0;
            return (b.dataMb || 0) - (a.dataMb || 0);
          });
          break;
        case 'validity_asc':
          formattedPackages.sort((a, b) => a.validityDays - b.validityDays);
          break;
        case 'validity_desc':
          formattedPackages.sort((a, b) => b.validityDays - a.validityDays);
          break;
        case 'popularity':
          formattedPackages.sort((a, b) => b.salesCount - a.salesCount);
          break;
        default:
          // Default sorting - keep original order or sort by best price first
          formattedPackages.sort((a, b) => {
            if (a.isBestPrice && !b.isBestPrice) return -1;
            if (!a.isBestPrice && b.isBestPrice) return 1;
            return 0;
          });
      }

      // Remove temporary priceNumeric field before sending response
      const responsePackages = formattedPackages.map(({ priceNumeric, ...pkg }) => pkg);

      res.json({
        packages: responsePackages,
        total: responsePackages.length,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ORDERS ====================

  app.get('/api/my-orders', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId || req.session?.userId;
      if (!userId) {
        return ApiResponse.unauthorized(res, 'Unauthorized');
      }

      const orders = await storage.getOrdersByUser(userId);

      const { resolvePackage } = await import("./services/packages/package-resolver");
      const ordersWithDetails = await Promise.all(
        orders.map(async (order) => {
          let pkg: any = null;
          try {
            if (order.packageId) {
              pkg = await storage.getUnifiedPackageById(order.packageId);
              if (!pkg) {
                pkg = await resolvePackage(order.packageId);
              }
              if (!pkg) {
                pkg = await storage.getPackageById(order.packageId);
              }
            }
          } catch (err) {
            console.warn(`[MyOrders] Failed to resolve package for order ${order.id}:`, err);
          }

          let destination: any = null;
          try {
            if (pkg?.destinationId) {
              destination = await storage.getDestinationById(pkg.destinationId);
            } else if (pkg?.regionId) {
              const region = await storage.getRegionById(pkg.regionId);
              if (region) {
                destination = {
                  id: region.id,
                  name: region.name,
                  countryCode: region.code || "GL",
                  image: region.image,
                };
              }
            }
          } catch (err) {
            console.warn(`[MyOrders] Failed to resolve destination for order ${order.id}:`, err);
          }

          return {
            ...order,
            package: pkg ? { ...pkg, destination } : null,
          };
        }),
      );

      ApiResponse.success(res, 'Orders retrieved successfully', ordersWithDetails);
    } catch (error: any) {
      console.error("[MyOrders] Error fetching orders:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Customer order status refresh
  app.post('/api/orders/:orderId/refresh-status', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId || req.session?.userId;
      const order = await storage.getOrderById(req.params.orderId);
      if (!order) {
        return ApiResponse.notFound(res, 'Order not found');
      }

      const user = userId ? await storage.getUser(userId) : null;
      const isAdmin = req.session?.adminId || req.session?.role === 'admin' || (req as any).role === 'admin' || user?.role === 'admin';
      const isOwner = (userId && order.userId === userId) || (user?.email && order.guestEmail && order.guestEmail.toLowerCase() === user.email.toLowerCase());

      if (!isAdmin && !isOwner) {
        return ApiResponse.forbidden(res, 'Access denied');
      }

      const { orderStatusService } = await import('./services/order-status');
      const updated = await orderStatusService.checkSingleOrderStatus(req.params.orderId);

      const refreshedOrder = await storage.getOrderById(req.params.orderId);
      res.json({
        success: true,
        updated: !!updated,
        message: updated ? 'Order status updated successfully' : 'No updates available yet',
        order: refreshedOrder,
      });
    } catch (error: any) {
      console.error('[Orders] Error refreshing status:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== TICKETS ====================

  app.get('/api/my-tickets', requireAuth, async (req: Request, res: Response) => {
    try {
      const tickets = await storage.getTicketsByUser(req.session.userId!);
      ApiResponse.success(res, 'Tickets retrieved successfully', tickets);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin reply to ticket

  // ==================== NOTIFICATIONS ====================

  // ==================== REFERRAL ROUTES ====================

  // Helper function to generate unique referral code
  async function generateReferralCode(userName: string): Promise<string> {
    const baseName = userName?.split(' ')[0]?.toUpperCase() || 'USER';
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      const code = `${baseName}${randomDigits}`;

      const existing = await db
        .select()
        .from(referralProgram)
        .where(eq(referralProgram.referralCode, code))
        .limit(1);
      if (existing.length === 0) {
        return code;
      }
      attempts++;
    }

    return `${baseName}${Date.now().toString().slice(-6)}`;
  }


  // Get referral settings (user-facing)
  app.get('/api/referrals/settings', async (req: Request, res: Response) => {
    try {
      const settings = await db.select().from(referralSettings).limit(1);

      if (settings.length === 0) {
        const defaultSettings = await db.insert(referralSettings).values({}).returning();
        return res.json(defaultSettings[0]);
      }

      res.json(settings[0]);
    } catch (error: any) {
      console.error('Error getting referral settings:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get or create user's referral program
  app.get('/api/referrals/my-program', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;

      let program = await db
        .select()
        .from(referralProgram)
        .where(eq(referralProgram.userId, userId))
        .limit(1);

      if (program.length === 0) {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        const userName = user[0]?.name || 'USER';
        const referralCode = await generateReferralCode(userName);

        const newProgram = await db
          .insert(referralProgram)
          .values({
            userId,
            referralCode,
          })
          .returning();

        program = newProgram;
      }

      const shareUrl = `${req.protocol}://${req.get('host')}/login?ref=${program[0].referralCode}`;

      res.json({
        ...program[0],
        shareUrl,
      });
    } catch (error: any) {
      console.error('Error getting referral program:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get user's referral history
  app.get('/api/referrals/my-referrals', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      const userReferrals = await db
        .select({
          id: referrals.id,
          referralCode: referrals.referralCode,
          status: referrals.status,
          rewardAmount: referrals.rewardAmount,
          rewardPaid: referrals.rewardPaid,
          completedAt: referrals.completedAt,
          createdAt: referrals.createdAt,
          referredUserEmail: users.email,
          referredUserName: users.name,
        })
        .from(referrals)
        .leftJoin(users, eq(referrals.referredId, users.id))
        .where(eq(referrals.referrerId, userId))
        .orderBy(desc(referrals.createdAt))
        .limit(limit)
        .offset(offset);

      const totalCount = await db
        .select({ count: count() })
        .from(referrals)
        .where(eq(referrals.referrerId, userId));

      const maskedReferrals = userReferrals.map((ref) => ({
        ...ref,
        referredUserEmail: ref.referredUserEmail
          ? ref.referredUserEmail.replace(/^(.)(.*)(@.*)$/, '$1***$3')
          : null,
      }));

      res.json({
        referrals: maskedReferrals,
        pagination: {
          page,
          limit,
          total: totalCount[0]?.count || 0,
          totalPages: Math.ceil((totalCount[0]?.count || 0) / limit),
        },
      });
    } catch (error: any) {
      console.error('Error getting referrals:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Validate referral code

  app.post('/api/referrals/complete', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { referralCode, orderId } = req.body;

      if (!referralCode || !orderId) {
        return res.status(400).json({
          success: false,
          message: 'Referral code and order ID are required',
        });
      }

      // Check if referral program enabled
      const settings = await db.select().from(referralSettings).limit(1);
      if (!settings[0] || !settings[0].enabled) {
        return res.status(400).json({
          success: false,
          message: 'Referral program is currently disabled',
        });
      }

      // Already used?
      const existing = await db
        .select()
        .from(referrals)
        .where(eq(referrals.referredId, userId))
        .limit(1);

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Referral already recorded for this user',
        });
      }

      // Find the referral program entry
      const program = await db
        .select()
        .from(referralProgram)
        .where(eq(referralProgram.referralCode, referralCode.toUpperCase()))
        .limit(1);

      if (program.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code',
        });
      }

      if (program[0].userId === userId) {
        return res.status(400).json({
          success: false,
          message: 'You cannot use your own referral code',
        });
      }

      const referrerId = program[0].userId;

      // Compute reward amount
      let rewardAmount = 0;
      if (settings[0].rewardType === 'percentage') {
        rewardAmount = (Number(settings[0].rewardValue) * Number(req.body.orderAmount)) / 100;
      } else {
        rewardAmount = Number(settings[0].rewardValue);
      }

      // Insert the referral record
      await db.insert(referrals).values({
        referrerId,
        referredId: userId,
        referralCode: referralCode.toUpperCase(),
        status: 'completed',
        referredOrderId: orderId,
        rewardAmount: rewardAmount.toString(),
        completedAt: new Date(),
      });

      // Update totals for referrer
      await db
        .update(referralProgram)
        .set({
          totalReferrals: sql`${referralProgram.totalReferrals} + 1`,
          totalEarnings: sql`${referralProgram.totalEarnings} + ${rewardAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(referralProgram.userId, referrerId));

      // Create a notification for the referrer
      await storage.createNotification({
        userId: referrerId,
        type: 'referral',
        title: 'Referral Reward Earned!',
        message: `You've earned ${rewardAmount} from a successful referral!`,
        read: false,
        metadata: { referralCode, orderId },
      });

      return res.json({
        success: true,
        message: 'Referral recorded successfully',
        referralCode: referralCode.toUpperCase(),
        rewardAmount,
      });
    } catch (error: any) {
      console.error('Error completing referral:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to complete referral',
      });
    }
  });

  app.post('/api/referrals/signup', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Referral code is required',
        });
      }

      // 1️⃣ Check referral settings
      const [settings] = await db.select().from(referralSettings).limit(1);

      if (!settings || !settings.enabled) {
        return res.status(400).json({
          success: false,
          message: 'Referral program is currently disabled',
        });
      }

      // 2️⃣ Validate referral code
      const [program] = await db
        .select()
        .from(referralProgram)
        .where(eq(referralProgram.referralCode, code.toUpperCase()))
        .limit(1);

      if (!program) {
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code',
        });
      }

      // 3️⃣ Prevent self-referral
      if (program.userId === userId) {
        return res.status(400).json({
          success: false,
          message: 'You cannot use your own referral code',
        });
      }

      // 4️⃣ Prevent duplicate referral
      const existing = await db
        .select()
        .from(referrals)
        .where(eq(referrals.referredId, userId))
        .limit(1);

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Referral already applied',
        });
      }

      // 5️⃣ Create referral relation (NO discount yet)
      await db.insert(referrals).values({
        referrerId: program.userId,
        referredId: userId,
        referralCode: code.toUpperCase(),
        status: 'pending',
      });

      return res.json({
        success: true,
        message: 'Referral applied successfully',
      });
    } catch (error) {
      console.error('Apply referral error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to apply referral',
      });
    }
  });

  // Apply referral code to user account
  app.post('/api/referrals/apply', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { code, subtotal } = req.body;

      if (!code || typeof subtotal !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'Referral code and subtotal are required',
        });
      }

      const settings = await db.select().from(referralSettings).limit(1);
      if (!settings[0] || !settings[0].enabled) {
        return res.status(400).json({ success: false, message: 'Referral program disabled' });
      }

      const program = await db
        .select()
        .from(referralProgram)
        .where(eq(referralProgram.referralCode, code.toUpperCase()))
        .limit(1);

      if (program.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid referral code' });
      }

      if (program[0].userId === userId) {
        return res.status(400).json({
          success: false,
          message: 'You cannot use your own referral code',
        });
      }

      const minOrder = Number(settings[0].minimumOrderAmount || 0);
      if (subtotal < minOrder) {
        return res.status(400).json({
          success: false,
          message: `Minimum order amount is ${minOrder}`,
        });
      }

      let discount = 0;
      if (settings[0].rewardType === 'percentage') {
        discount = (subtotal * Number(settings[0].referredUserDiscount)) / 100;
      } else {
        discount = Number(settings[0].referredUserDiscount);
      }

      discount = Math.min(discount, subtotal);
      const finalTotal = Number((subtotal - discount).toFixed(2));

      res.json({
        success: true,
        referralCode: code.toUpperCase(),
        discount: Number(discount.toFixed(2)),
        finalTotal,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to apply referral' });
    }
  });

  // Get user's referral credit balance
  app.get('/api/referrals/my-balance', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;

      const user = await db
        .select({ referralBalance: users.referralBalance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user[0]) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const transactions = await db
        .select()
        .from(referralTransactions)
        .where(eq(referralTransactions.userId, userId))
        .orderBy(desc(referralTransactions.createdAt))
        .limit(10);

      res.json({
        success: true,
        balance: parseFloat(user[0].referralBalance?.toString() || '0'),
        recentTransactions: transactions,
      });
    } catch (error: any) {
      console.error('Error getting referral balance:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Use referral credits at checkout
  app.post('/api/referrals/use-credits', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { amount, subtotal } = req.body;

      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid credit amount' });
      }

      if (typeof subtotal !== 'number' || subtotal <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid subtotal' });
      }

      const user = await db
        .select({ referralBalance: users.referralBalance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user[0]) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const currentBalance = parseFloat(user[0].referralBalance?.toString() || '0');

      if (amount > currentBalance) {
        return res.status(400).json({ success: false, message: 'Insufficient referral credits' });
      }

      const maxCreditsToUse = Math.min(amount, subtotal);
      const discount = Math.min(maxCreditsToUse, currentBalance);
      const finalTotal = Math.max(subtotal - discount, 0);

      res.json({
        success: true,
        creditsApplied: Number(discount.toFixed(2)),
        discount: Number(discount.toFixed(2)),
        finalTotal: Number(finalTotal.toFixed(2)),
        remainingBalance: Number((currentBalance - discount).toFixed(2)),
      });
    } catch (error: any) {
      console.error('Error using referral credits:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Deduct referral credits after successful payment (called from confirm-payment)
  app.post('/api/referrals/deduct-credits', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { amount, orderId } = req.body;

      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid credit amount' });
      }

      const user = await db
        .select({ referralBalance: users.referralBalance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user[0]) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const currentBalance = parseFloat(user[0].referralBalance?.toString() || '0');

      if (amount > currentBalance) {
        return res.status(400).json({ success: false, message: 'Insufficient referral credits' });
      }

      const newBalance = currentBalance - amount;

      await db
        .update(users)
        .set({
          referralBalance: newBalance.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      await db.insert(referralTransactions).values({
        userId,
        type: 'credit_used',
        amount: (-amount).toFixed(2),
        balanceBefore: currentBalance.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        orderId: orderId || null,
        description: `Used ${amount.toFixed(2)} credits for order`,
      });

      res.json({
        success: true,
        message: 'Credits deducted successfully',
        creditsUsed: amount,
        newBalance: Number(newBalance.toFixed(2)),
      });
    } catch (error: any) {
      console.error('Error deducting referral credits:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ADMIN ROUTES ====================

  // Admin login (simple password-based for testing)

  app.post('/api/admin/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }

      // console.log("Admin login attempt:", email);
      const admin = await storage.getAdminByEmail(email);
      // console.log("Admin found:", !!admin);

      // If no admin found, respond 401 (don't reveal whether email exists)
      if (!admin || !admin.password) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Compare provided password with stored hashed password
      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        console.log('Invalid password for:', email);
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Authentication successful — attach to session
      req.session.adminId = admin.id;

      res.json({
        message: 'Login successful',
        admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      });
    } catch (error: any) {
      console.error('Admin login error:', error);
      res.status(500).json({ success: false, message: 'Something went wrong' });
    }
  });

  app.get('/api/admin/stats', requireAdmin, async (req: Request, res: Response) => {
    try {
      const timeFilter = (req.query.timeFilter as '7days' | '30days' | 'lifetime') || 'lifetime';
      const stats = await storage.getStats(timeFilter);
      ApiResponse.success(res, 'Statistics retrieved successfully', stats);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // app.get("/api/admin/orders", requireAdmin, async (req: Request, res: Response) => {
  //   try {
  //     const orders = await storage.getAllOrders();
  //     const providers = await storage.getAllProviders();
  //     const providerMap = new Map(providers.map(p => [p.id, p.name]));

  //     const ordersWithDetails = await Promise.all(
  //       orders.map(async (order) => {
  //         const user = await storage.getUser(order.userId);
  //         const pkg = await storage.getPackageById(order.packageId);
  //         let destination;
  //         if (pkg?.destinationId) {
  //           destination = await storage.getDestinationById(pkg.destinationId);
  //         }
  //         console.log("order", order);
  //         // Add provider names for failover display
  //         const originalProviderName = order.originalProviderId ? providerMap.get(order.originalProviderId) : undefined;
  //         const finalProviderName = order.finalProviderId ? providerMap.get(order.finalProviderId) : undefined;

  //         return {
  //           ...order,
  //           user,
  //           package: { ...pkg, destination },
  //           originalProviderName,
  //           finalProviderName,
  //         };
  //       })
  //     );

  //     ApiResponse.success(res, "Orders retrieved successfully", ordersWithDetails);
  //   } catch (error: any) {
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // Get custom/unassigned eSIM orders (MUST be before /api/admin/orders/:id to avoid route conflict)
  app.get('/api/admin/get-custom-orders', requireAdmin, async (req: Request, res: Response) => {
    try {
      const allOrders = await storage.getAllOrders();

      // Filter for admin-ordered eSIMs (with or without userId)
      const customOrders = allOrders.filter((order) => order.orderedBy !== null);

      const ordersWithDetails = await Promise.all(
        customOrders.map(async (order) => {
          const pkg = await storage.getPackageById(order.packageId);
          const user = order.userId ? await storage.getUser(order.userId) : null;
          const orderedByAdmin = order.orderedBy ? await storage.getUser(order.orderedBy) : null;
          const assignedByAdmin = order.assignedBy ? await storage.getUser(order.assignedBy) : null;

          let destination;
          if (pkg?.destinationId) {
            destination = await storage.getDestinationById(pkg.destinationId);
          }

          return {
            ...order,
            package: { ...pkg, destination },
            user,
            orderedByAdmin,
            assignedByAdmin,
            isAssigned: order.userId !== null,
          };
        }),
      );

      ApiResponse.success(res, 'Orders retrieved successfully', ordersWithDetails);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/admin/orders/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const user = order.userId ? await storage.getUser(order.userId) : null;
      const pkg = await storage.getPackageById(order.packageId);
      let destination;
      if (pkg?.destinationId) {
        destination = await storage.getDestinationById(pkg.destinationId);
      }

      res.json({ ...order, user, package: { ...pkg, destination } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post(
    '/api/admin/orders/:id/send-instructions',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const order = await storage.getOrderById(req.params.id);
        if (!order) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const user = await storage.getUser(order.userId);
        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const installationEmail = await generateInstallationEmail({
          qrCode: order.qrCode,
          lpaCode: order.lpaCode,
        });

        await sendEmail({
          to: user.email,
          subject: installationEmail.subject,
          html: installationEmail.html,
        });

        await storage.updateOrder(order.id, { installationSent: true });

        res.json({ success: true, message: 'Installation instructions sent successfully' });
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Admin eSIM Order Management - Multi-Provider Support
  app.post('/api/admin/orders/esim', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { packageId, quantity = 1 } = req.body;
      const adminId = req.session.adminId!;

      if (!packageId || quantity < 1) {
        return res.status(400).json({ success: false, message: 'Invalid package or quantity' });
      }

      // Look up unified package (supports all providers)
      const unifiedPkg = await storage.getUnifiedPackageById(packageId);
      if (!unifiedPkg) {
        return res.status(404).json({ success: false, message: 'Package not found' });
      }

      // Get the provider for this package
      const provider = await storage.getProviderById(unifiedPkg.providerId);
      if (!provider) {
        return res.status(404).json({ success: false, message: 'Provider not found' });
      }

      if (!provider.enabled) {
        return res
          .status(400)
          .json({ success: false, message: `Provider ${provider.name} is currently disabled` });
      }

      const retailPrice = parseFloat(unifiedPkg.retailPrice?.toString() || '0');
      const wholesalePrice = parseFloat(unifiedPkg.wholesalePrice?.toString() || '0');

      // Create the order record first
      const order = await storage.createOrder({
        userId: null,
        packageId: unifiedPkg.id,
        orderType: quantity === 1 ? 'single' : 'batch',
        quantity,
        status: 'processing',
        price: retailPrice.toString(),
        airaloPrice: wholesalePrice.toString(),
        currency: unifiedPkg.currency || 'USD',
        dataAmount: unifiedPkg.dataAmount,
        validity: unifiedPkg.validity?.toString(),
        orderedBy: adminId,
        providerId: provider.id,
        installationSent: false,
      });

      try {
        // Get provider service and create order
        const providerService = providerFactory.getService(provider);

        const orderResponse = await providerService.createOrder({
          packageId: unifiedPkg.slug,
          quantity,
          customerRef: `Admin Order ${order.id}`,
        });

        if (!orderResponse.success) {
          await storage.updateOrder(order.id, { status: 'failed' });
          throw new Error(orderResponse.errorMessage || 'Failed to provision eSIM');
        }

        // Update order with provider response
        await storage.updateOrder(order.id, {
          providerOrderId: orderResponse.providerOrderId,
          requestId: orderResponse.requestId,
          iccid: orderResponse.iccid,
          qrCode: orderResponse.qrCode,
          qrCodeUrl: orderResponse.qrCodeUrl,
          smdpAddress: orderResponse.smdpAddress,
          activationCode: orderResponse.activationCode,
          status: orderResponse.status === 'completed' ? 'completed' : 'processing',
        });

        const finalOrder = await storage.getOrderById(order.id);
        ApiResponse.success(res, 'Order processed successfully', finalOrder);
      } catch (providerError: any) {
        console.error(`❌ Admin order failed for provider ${provider.slug}:`, providerError);
        await storage.updateOrder(order.id, { status: 'failed' });
        throw new Error(providerError.message || 'Failed to provision eSIM. Please try again.');
      }
    } catch (error: any) {
      console.error('Admin eSIM order error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Assign unassigned eSIM to customer
  app.post('/api/admin/orders/:id/assign', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      const adminId = req.session.adminId!;
      const orderId = req.params.id;

      if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
      }

      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      if (order.userId !== null) {
        return res
          .status(400)
          .json({ success: false, message: 'eSIM is already assigned to a customer' });
      }

      if (order.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'eSIM is not ready for assignment. Status: ' + order.status,
        });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Assign eSIM to customer
      await storage.updateOrder(orderId, {
        userId,
        assignedBy: adminId,
      });

      // Send installation instructions to customer
      if (order.qrCodeUrl && order.iccid) {
        const pkg = await storage.getPackageById(order.packageId);
        const installEmail = await generateInstallationEmail({
          name: user.name || 'Traveler',
          packageName: pkg ? `${pkg.dataAmount} - ${pkg.validity} Days` : 'eSIM Package',
          qrCodeUrl: order.qrCodeUrl,
          iccid: order.iccid,
          activationCode: order.activationCode || '',
          smdpAddress: order.smdpAddress || '',
        });

        await sendEmail({
          to: user.email,
          subject: installEmail.subject,
          html: installEmail.html,
        });

        await storage.updateOrder(orderId, { installationSent: true });

        // Create notification
        await storage.createNotification({
          userId,
          type: 'purchase',
          title: 'eSIM Assigned to You!',
          message: `An eSIM has been assigned to your account. Check your email for installation instructions.`,
          read: false,
          metadata: { orderId },
        });
      }

      const updatedOrder = await storage.getOrderById(orderId);
      ApiResponse.success(res, 'Order updated successfully', updatedOrder);
    } catch (error: any) {
      console.error('Assign eSIM error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/admin/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const customers = await storage.getAllUsers();
      ApiResponse.success(res, 'Customers retrieved successfully', customers);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/admin/tickets', requireAdmin, async (req: Request, res: Response) => {
    try {
      const tickets = await storage.getAllTickets();
      ApiResponse.success(res, 'Tickets retrieved successfully', tickets);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/admin/orders', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, packageId, price } = req.body;
      const order = await storage.createOrder({
        userId,
        packageId,
        price,
        status: 'pending',
        dataAmount: 'N/A',
        validity: 0,
        installationSent: false,
      });
      ApiResponse.success(res, 'Order retrieved successfully', order);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/admin/orders/:id/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const order = await storage.updateOrder(req.params.id, { status });
      ApiResponse.success(res, 'Order retrieved successfully', order);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete('/api/admin/orders/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteOrder(req.params.id);
      res.json({ success: true, message: 'Order deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/admin/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email, name } = req.body;
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already exists in the system' });
      }

      const user = await storage.createUser({
        email,
        name,
        kycStatus: 'pending',
      });
      ApiResponse.success(res, 'User created successfully', user);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/admin/customers/:id/kyc', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { kycStatus } = req.body;
      const user = await storage.updateUser(req.params.id, { kycStatus });
      ApiResponse.success(res, 'User retrieved successfully', user);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete('/api/admin/customers/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/referrals/my-gift-cards', requireAuth, async (req, res) => {
    console.log('req.user', req.userId);
    const userId = req.userId;
    try {
      const giftCardsData = await db
        .select()
        .from(giftCards)
        .where(eq(giftCards.purchasedBy, userId))
        .orderBy(desc(giftCards.createdAt));

      res.json({ giftCardsData });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch gift cards' });
    }
  });

  // 2. POST /api/referrals/redeem-to-gift-card
  // Convert referral earnings to a gift card
  app.post('/api/referrals/redeem-to-gift-card', requireAuth, async (req, res) => {
    const userId = req.userId;
    const { code, amount, currency, message, theme } = req.body;

    try {
      // Validate input
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      // Get user's referral program
      const program = await db.query.referralProgram.findFirst({
        where: eq(referralProgram.userId, userId),
      });

      if (!program) {
        return res.status(404).json({ error: 'Referral program not found' });
      }

      // Check if user has sufficient balance
      const availableBalance = parseFloat(program.totalEarnings);
      if (amount > availableBalance) {
        return res.status(400).json({
          error: 'Insufficient balance. Available balance: ' + availableBalance,
        });
      }

      // Create gift card
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year expiry

      console.log({
        code,
        amount: amount.toString(),
        currency: currency || 'USD',
        balance: amount.toString(),
        balanceBefore: program.totalEarnings,
        balanceAfter: (availableBalance - amount).toFixed(2),
        purchasedBy: userId,
        message: message || null,
        theme: theme || 'default',
        status: 'active',
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const [giftCard] = await db
        .insert(giftCards)
        .values({
          code,
          amount: amount.toString(),
          currency: currency || 'USD',
          balance: amount.toString(),
          purchasedBy: userId,
          message: message || null,
          theme: theme || 'default',
          status: 'active',
          expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Deduct from user's referral earnings
      const newBalance = (availableBalance - amount).toFixed(2);
      await db
        .update(referralProgram)
        .set({
          totalEarnings: newBalance,
          updatedAt: new Date(),
        })
        .where(eq(referralProgram.userId, userId));

      // Optional: Create a transaction record for tracking
      await db.insert(referralTransactions).values({
        userId,
        type: 'gift_card_redemption',
        amount: -amount,
        balanceBefore: program.totalEarnings,
        balanceAfter: newBalance,
        description: `Redeemed ${amount} to gift card ${code}`,
        giftCardId: giftCard.id,
        createdAt: new Date(),
      });

      res.json({
        success: true,
        giftCard,
        newBalance,
      });
    } catch (error) {
      console.error('Gift card redemption error:', error);
      res.status(500).json({ error: 'Failed to redeem gift card' });
    }
  });

  // 3. POST /api/gift-cards/apply
  // Apply a gift card to user's account
  // app.post("/api/gift-cards/apply", async (req, res) => {
  //   const userId = req.user.id;
  //   const { code } = req.body;

  //   try {
  //     // Find gift card
  //     const giftCard = await db.query.giftCards.findFirst({
  //       where: eq(giftCards.code, code),
  //     });

  //     if (!giftCard) {
  //       return res.status(404).json({ error: "Invalid gift card code" });
  //     }

  //     // Validate gift card
  //     if (giftCard.status !== "active") {
  //       return res.status(400).json({ error: "This gift card is no longer active" });
  //     }

  //     if (new Date(giftCard.expiresAt) < new Date()) {
  //       return res.status(400).json({ error: "This gift card has expired" });
  //     }

  //     if (parseFloat(giftCard.balance) <= 0) {
  //       return res.status(400).json({ error: "This gift card has no remaining balance" });
  //     }

  //     // Update gift card
  //     await db
  //       .update(giftCards)
  //       .set({
  //         redeemedBy: userId,
  //         redeemedAt: new Date(),
  //         status: "used",
  //         updatedAt: new Date(),
  //       })
  //       .where(eq(giftCards.id, giftCard.id));

  //     // Add balance to user's account (you can implement this based on your system)
  //     // For example, add to user's wallet or apply as credit

  //     res.json({
  //       success: true,
  //       message: "Gift card applied successfully",
  //       amount: giftCard.balance,
  //       currency: giftCard.currency,
  //     });
  //   } catch (error) {
  //     console.error("Gift card application error:", error);
  //     res.status(500).json({ error: "Failed to apply gift card" });
  //   }
  // });

  app.post('/api/admin/tickets', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, title, description, priority } = req.body;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const ticket = await storage.createTicket({
        userId,
        userName: user.name || user.email,
        title,
        description,
        priority: priority || 'medium',
        status: 'open',
      });
      ApiResponse.success(res, 'Ticket retrieved successfully', ticket);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/admin/tickets/:id/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, priority } = req.body;
      const ticket = await storage.updateTicket(req.params.id, { status, priority });
      ApiResponse.success(res, 'Ticket retrieved successfully', ticket);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete('/api/admin/tickets/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteTicket(req.params.id);
      res.json({ success: true, message: 'Ticket deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/admin/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      ApiResponse.success(res, 'Users retrieved successfully', users);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/admin/tickets', requireAdmin, async (req: Request, res: Response) => {
    try {
      const tickets = await storage.getAllTickets();

      const ticketsWithDetails = await Promise.all(
        tickets.map(async (ticket) => {
          const user = await storage.getUser(ticket.userId);
          const replies = await storage.getRepliesByTicket(ticket.id);
          return { ...ticket, user, replies };
        }),
      );

      ApiResponse.success(res, 'Tickets retrieved successfully', ticketsWithDetails);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin Package Management (with pagination)
  app.get('/api/admin/packages', requireAdmin, async (req, res) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.max(Number(req.query.limit) || 10, 1);
      const search = (req.query.search as string)?.trim() || '';
      const providerId = (req.query.providerId as string) || undefined;
      const destinationId = (req.query.destinationId as string) || undefined;
      const offset = (page - 1) * limit;

      const { data, total } = await storage.getUnifiedPackagesPaginated({
        limit,
        offset,
        search,
        providerId,
        destinationId,
      });

      const marginSetting = await storage.getSettingByKey('pricing_margin');
      const marginPercent = marginSetting ? Number(marginSetting.value) : 0;

      const result = await Promise.all(
        data.map(async (pkg) => {
          const destination = pkg.destinationId
            ? await storage.getDestinationById(pkg.destinationId)
            : null;
          const region = pkg.regionId ? await storage.getRegionById(pkg.regionId) : null;

          const basePrice = Number(pkg.retailPrice);
          const customerPrice = basePrice * (1 + marginPercent / 100);

          return {
            ...pkg,
            price: customerPrice.toFixed(2),
            retailPrice: basePrice.toFixed(2),
            destination,
            region,
          };
        }),
      );

      res.json({
        data: result,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/api/admin/packages/:id/flags', requireAdmin, async (req: Request, res: Response) => {
    try {
      // Get existing package first
      const existingPkg = await storage.getPackageById(req.params.id);
      if (!existingPkg) {
        return res.status(404).json({ success: false, message: 'Package not found' });
      }

      // Extract only the flag fields from request body
      const { isPopular, isTrending, isRecommended, isBestValue } = req.body;

      // Merge flags with existing package data
      const updatedPkg = await storage.updatePackage(req.params.id, {
        ...existingPkg,
        isPopular: isPopular !== undefined ? isPopular : existingPkg.isPopular,
        isTrending: isTrending !== undefined ? isTrending : existingPkg.isTrending,
        isRecommended: isRecommended !== undefined ? isRecommended : existingPkg.isRecommended,
        isBestValue: isBestValue !== undefined ? isBestValue : existingPkg.isBestValue,
      });
      ApiResponse.success(res, 'Package updated successfully', updatedPkg);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/admin/packages/:id/custom', requireAdmin, async (req: Request, res: Response) => {
    try {
      // Get existing package first
      const existingPkg = await storage.getPackageById(req.params.id);
      if (!existingPkg) {
        return res.status(404).json({ success: false, message: 'Package not found' });
      }

      const { customImage, customDescription } = req.body;

      // Merge custom fields with existing package data
      const updatedPkg = await storage.updatePackage(req.params.id, {
        ...existingPkg,
        customImage: customImage !== undefined ? customImage : existingPkg.customImage,
        customDescription:
          customDescription !== undefined ? customDescription : existingPkg.customDescription,
      });
      ApiResponse.success(res, 'Package updated successfully', updatedPkg);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/admin/packages/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const pkg = await storage.updatePackage(req.params.id, req.body);
      ApiResponse.success(res, 'Package operation successful', pkg);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete('/api/admin/packages/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deletePackage(req.params.id);
      res.json({ success: true, message: 'Package deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Public currency endpoint
  app.get('/api/currencies', async (req: Request, res: Response) => {
    try {
      const currencies = await storage.getCurrencies();
      const enabledCurrencies = currencies.filter((c) => c.isEnabled);
      ApiResponse.success(res, 'Currencies retrieved successfully', enabledCurrencies);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Currency Management
  app.get('/api/admin/currencies', requireAdmin, async (req: Request, res: Response) => {
    try {
      const currencies = await storage.getCurrencies();
      ApiResponse.success(res, 'Currencies retrieved successfully', currencies);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/admin/currencies', requireAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = insertCurrencyRateSchema.parse(req.body);
      const currency = await storage.createCurrency(validatedData);
      ApiResponse.success(res, 'Currency operation successful', currency);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/admin/currencies/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      // If setting as default, first unset all other defaults
      if (req.body.isDefault === true) {
        const allCurrencies = await storage.getCurrencies();
        for (const curr of allCurrencies) {
          if (curr.isDefault && curr.id !== req.params.id) {
            await storage.updateCurrency(curr.id, { isDefault: false });
          }
        }
      }
      const currency = await storage.updateCurrency(req.params.id, req.body);
      ApiResponse.success(res, 'Currency operation successful', currency);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete('/api/admin/currencies/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteCurrency(req.params.id);
      res.json({ success: true, message: 'Currency deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Payment Methods Settings
  app.get('/api/admin/payment-settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { paymentSettings } = await import('@shared/schema');
      const settings = await db.query.paymentSettings.findMany();
      ApiResponse.success(res, 'Settings retrieved successfully', settings);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/admin/payment-settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { paymentSettings, insertPaymentSettingSchema } = await import('@shared/schema');
      const { settings: settingsData } = req.body;

      if (!settingsData || !Array.isArray(settingsData)) {
        return res.status(400).json({ success: false, message: 'Invalid settings data' });
      }

      // Update or create each payment method setting
      const updatedSettings = await Promise.all(
        settingsData.map(async (setting: any) => {
          const existing = await db.query.paymentSettings.findFirst({
            where: eq(paymentSettings.method, setting.method),
          });

          if (existing) {
            // Update existing setting
            const [updated] = await db
              .update(paymentSettings)
              .set({
                enabled: setting.enabled,
                minimumAmount: setting.minimumAmount,
                settings: setting.settings,
                updatedAt: new Date(),
              })
              .where(eq(paymentSettings.id, existing.id))
              .returning();
            return updated;
          } else {
            // Create new setting
            const [created] = await db
              .insert(paymentSettings)
              .values({
                method: setting.method,
                enabled: setting.enabled,
                minimumAmount: setting.minimumAmount,
                settings: setting.settings,
              })
              .returning();
            return created;
          }
        }),
      );

      ApiResponse.success(res, 'Settings updated successfully', updatedSettings);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Public Settings API
  app.get('/api/public/settings', async (req: Request, res: Response) => {
    try {
      const settings = await storage.getPublicSettings();

      const settingsObj: Record<string, string> = {};
      settings.forEach((s) => {
        settingsObj[s.key] = s.value;
      });

      return ApiResponse.success(res, 'Public settings retrieved successfully', settingsObj);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  // Admin Settings Management
  app.get('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const allSettings = await storage.getAllSettings();
      // Convert array to key-value object for easier frontend use
      const settingsObj: Record<string, string> = {};
      allSettings.forEach((s) => {
        settingsObj[s.key] = s.value;
      });
      ApiResponse.success(res, 'Settings retrieved successfully', settingsObj);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/admin/settings/:key', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { value, category } = req.body;
      const setting = await storage.setSetting({
        key: req.params.key,
        value,
        category: category || 'general',
      });

      // Reset email transporter if SMTP settings are updated
      if (category === 'smtp' || req.params.key.startsWith('smtp_')) {
        resetTransporter();
      }

      ApiResponse.success(res, 'Setting operation successful', setting);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/admin/test-email', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }

      // Re-initialize transporter with current DB settings to ensure we're testing saved config
      resetTransporter();

      const platformName = (await storage.getSettingByKey('platform_name'))?.value || 'Esimconnect';

      const emailResult = await sendEmail({
        to: email,
        subject: `SMTP Test Email - ${platformName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background: #3b82f6; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">SMTP Test Successful</h1>
            </div>
            <div style="padding: 30px;">
              <p>Hello,</p>
              <p>This is a test email from <strong>${platformName}</strong> Admin Dashboard.</p>
              <p>If you are reading this, it means your SMTP settings are configured correctly and the system can successfully send emails.</p>
              <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px dashed #cbd5e1;">
                <p style="margin: 0; font-size: 14px; color: #64748b;"><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;"><strong>Recipient:</strong> ${email}</p>
              </div>
              <p>You can now safely use this configuration for OTP codes, order confirmations, and notifications.</p>
            </div>
            <div style="background: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #94a3b8;">
              &copy; ${new Date().getFullYear()} ${platformName}. All rights reserved.
            </div>
          </div>
        `,
        text: `SMTP Test Successful! Your configuration for ${platformName} is working correctly.`,
      });

      if (!emailResult?.success) {
        return res.status(400).json({
          success: false,
          message: `Failed to send email: ${emailResult?.error || 'Unknown error'}`
        });
      }

      ApiResponse.success(res, 'Test email sent successfully');
    } catch (error: any) {
      console.error('Test email failed:', error);
      res.status(500).json({ success: false, message: 'Failed to send test email: ' + error.message });
    }
  });

  // AI Settings - OpenAI status and configuration
  app.get('/api/admin/ai-settings/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { openAIService } = await import('./services/ai/openai-service');
      const { db } = await import('./db');
      const { platformSettings } = await import('@shared/schema');
      const { eq, inArray } = await import('drizzle-orm');

      const apiKey = process.env.OPENAI_API_KEY;
      const isConfigured = !!apiKey && apiKey.length > 10;
      const isReady = openAIService.isReady();

      const aiEnabledSetting = await db.query.platformSettings.findFirst({
        where: eq(platformSettings.key, 'ai_selection_enabled'),
      });
      const aiEnabled = aiEnabledSetting?.value === 'true';

      const weights = { price: 50, quality: 30, provider: 20 };
      const weightSettings = await db.query.platformSettings.findMany({
        where: inArray(platformSettings.key, [
          'ai_price_weight',
          'ai_quality_weight',
          'ai_provider_weight',
        ]),
      });

      for (const s of weightSettings) {
        const val = parseInt(s.value, 10);
        if (!isNaN(val)) {
          if (s.key === 'ai_price_weight') weights.price = val;
          if (s.key === 'ai_quality_weight') weights.quality = val;
          if (s.key === 'ai_provider_weight') weights.provider = val;
        }
      }

      const usage = openAIService.getUsageStats();

      const maskKey = (key: string) => {
        if (!key || key.length < 10) return '****';
        return key.substring(0, 8) + '...' + key.substring(key.length - 4);
      };

      ApiResponse.success(res, 'AI status retrieved', {
        isConfigured,
        isReady,
        maskedKey: isConfigured ? maskKey(apiKey!) : null,
        aiEnabled,
        weights,
        usage: {
          totalRequests: usage.totalRequests,
          totalTokens: usage.totalTokens,
          estimatedCost: Math.round(usage.estimatedCost * 100) / 100,
          errors: usage.errors,
          lastRequestAt: usage.lastRequestAt,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/admin/ai-settings/test', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { openAIService } = await import('./services/ai/openai-service');

      if (!openAIService.isReady()) {
        return res.status(400).json({
          success: false,
          message: 'OpenAI API key not configured. Add OPENAI_API_KEY to your environment secrets.',
        });
      }

      const result = await openAIService.testConnection();

      if (result.success) {
        ApiResponse.success(res, 'OpenAI connection successful', { latencyMs: result.latencyMs });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/admin/ai-settings/update', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { enabled, priceWeight, qualityWeight, providerWeight } = req.body;
      const { db } = await import('./db');
      const { platformSettings } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      const adminId = (req as any).admin?.id;

      const updates: Array<{ key: string; value: string }> = [];

      if (typeof enabled === 'boolean') {
        updates.push({ key: 'ai_selection_enabled', value: enabled.toString() });
      }
      if (typeof priceWeight === 'number' && priceWeight >= 0 && priceWeight <= 100) {
        updates.push({ key: 'ai_price_weight', value: priceWeight.toString() });
      }
      if (typeof qualityWeight === 'number' && qualityWeight >= 0 && qualityWeight <= 100) {
        updates.push({ key: 'ai_quality_weight', value: qualityWeight.toString() });
      }
      if (typeof providerWeight === 'number' && providerWeight >= 0 && providerWeight <= 100) {
        updates.push({ key: 'ai_provider_weight', value: providerWeight.toString() });
      }

      for (const update of updates) {
        const existing = await db.query.platformSettings.findFirst({
          where: eq(platformSettings.key, update.key),
        });

        if (existing) {
          await db
            .update(platformSettings)
            .set({ value: update.value, updatedAt: new Date(), updatedBy: adminId })
            .where(eq(platformSettings.key, update.key));
        } else {
          await db.insert(platformSettings).values({
            key: update.key,
            value: update.value,
            category: 'ai',
            description: `AI setting: ${update.key}`,
            updatedBy: adminId,
          });
        }
      }

      if (enabled) {
        const { packageAutoSelector } = await import('./services/packages/package-auto-selector');
        await packageAutoSelector.runAutoSelection();
      }

      ApiResponse.success(res, 'AI settings updated', { updates });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post(
    '/api/admin/ai-settings/run-selection',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { packageAutoSelector } = await import('./services/packages/package-auto-selector');
        const result = await packageAutoSelector.runAutoSelection();

        ApiResponse.success(res, 'AI selection completed', {
          success: result.success,
          totalGroups: result.totalGroups,
          packagesEnabled: result.packagesEnabled,
          packagesDisabled: result.packagesDisabled,
          aiEnabled: result.aiEnabled,
          aiDecisions: result.aiDecisions?.slice(0, 10),
          errors: result.errors,
        });
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Public providers endpoint (for filters)
  app.get('/api/providers', async (req: Request, res: Response) => {
    try {
      const enabledProviders = await storage.getEnabledProviders();
      res.json(enabledProviders);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Provider Management
  // Get all providers with package counts
  // app.get("/api/admin/providers", requireAdmin, async (req: Request, res: Response) => {
  //   try {
  //     const providers = await storage.getAllProviders();
  //     const { unifiedPackages } = await import("@shared/schema");
  //     const { eq } = await import("drizzle-orm");
  //     const { db } = await import("./db");

  //     // Get package counts for each provider
  //     const providersWithCounts = await Promise.all(
  //       providers.map(async (provider) => {
  //         const packageCount = await db.query.unifiedPackages.findMany({
  //           where: eq(unifiedPackages.providerId, provider.id),
  //         });

  //         return {
  //           ...provider,
  //           totalPackages: packageCount.length,
  //         };
  //       })
  //     );

  //     ApiResponse.success(res, "Providers retrieved successfully", providersWithCounts);
  //   } catch (error: any) {
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // Create a new provider
  // app.post("/api/admin/providers", requireAdmin, async (req: Request, res: Response) => {
  //   try {
  //     const { insertProviderSchema } = await import("@shared/schema");
  //     const validatedData = insertProviderSchema.parse(req.body);
  //     const provider = await storage.createProvider(validatedData);
  //     ApiResponse.success(res, "Provider operation successful", provider);
  //   } catch (error: any) {
  //     if (error.name === "ZodError") {
  //       return res.status(400).json({ success: false, message: "Validation error", errors: error.errors });
  //     }
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // Update a provider
  app.patch('/api/admin/providers/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { insertProviderSchema } = await import('@shared/schema');
      const validatedData = insertProviderSchema.partial().parse(req.body);
      const provider = await storage.updateProvider(req.params.id, validatedData);

      if (!provider) {
        return res.status(404).json({ success: false, message: 'Provider not found' });
      }

      // Clear provider factory cache after update
      const { providerFactory } = await import('./providers/provider-factory');
      providerFactory.clearCache();

      ApiResponse.success(res, 'Provider operation successful', provider);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, message: 'Validation error', errors: error.errors });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Soft delete a provider (disable it)
  app.delete('/api/admin/providers/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const provider = await storage.updateProvider(req.params.id, { enabled: false });

      if (!provider) {
        return res.status(404).json({ success: false, message: 'Provider not found' });
      }

      // Clear provider factory cache after disabling
      const { providerFactory } = await import('./providers/provider-factory');
      providerFactory.clearCache();

      res.json({ success: true, message: 'Provider disabled successfully', data: { provider } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Run price comparison
  app.post(
    '/api/admin/providers/price-comparison',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { priceComparisonService } = await import('./services/packages/price-comparison');
        const result = await priceComparisonService.runPriceComparison();

        res.json({
          message: 'Price comparison completed successfully',
          totalPackages: result.totalPackages,
          bestPricePackages: result.bestPricePackages,
          errors: result.errors,
        });
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Manual sync for a provider
  app.post('/api/admin/providers/:id/sync', requireAdmin, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderById(req.params.id);

      if (!provider) {
        return res.status(404).json({ success: false, message: 'Provider not found' });
      }

      if (!provider.enabled) {
        return res.status(400).json({ success: false, message: 'Cannot sync a disabled provider' });
      }

      // Get provider service and trigger sync
      const { providerFactory } = await import('./providers/provider-factory');
      const service = await providerFactory.getServiceById(provider.id);

      // Trigger the sync
      const result = await service.syncPackages();

      // Update last sync timestamp
      await storage.updateProvider(provider.id, {
        lastSyncAt: new Date(),
      });

      // Clear cache to ensure fresh provider data
      providerFactory.clearCache();

      // Always trigger unified packages sync after provider sync
      // This ensures existing packages get synced to unified_packages table
      if (result.success) {
        const { unifiedPackagesSyncService } =
          await import('./services/sync/unified-packages-sync');
        await unifiedPackagesSyncService.syncProviderPackages(provider.slug);
      }

      res.json({
        message: 'Sync completed successfully',
        success: result.success,
        packagesSynced: result.packagesSynced,
        packagesUpdated: result.packagesUpdated,
        packagesRemoved: result.packagesRemoved,
        errorMessage: result.errorMessage,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Manual topup sync for a provider (Airalo and eSIM Access only)
  app.post(
    '/api/admin/providers/:id/sync-topups',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const provider = await storage.getProviderById(req.params.id);

        if (!provider) {
          return res.status(404).json({ success: false, message: 'Provider not found' });
        }

        if (!provider.enabled) {
          return res
            .status(400)
            .json({ success: false, message: 'Cannot sync topups for a disabled provider' });
        }

        let result: any;

        if (provider.slug === 'airalo') {
          const { syncAiraloTopups } = await import('./services/airalo/topup-sync');
          result = await syncAiraloTopups(provider);
        } else if (provider.slug === 'esim-access') {
          const { syncEsimAccessTopups } = await import('./services/esim-access/topup-sync');
          // eSIM Access needs API credentials
          const accessCode = process.env.ESIM_ACCESS_CLIENT_ID;
          const secretKey = process.env.ESIM_ACCESS_CLIENT_SECRET;

          if (!accessCode || !secretKey) {
            return res.status(400).json({
              success: false,
              message: 'eSIM Access credentials not configured',
            });
          }

          result = await syncEsimAccessTopups(provider, accessCode, secretKey);
        } else if (provider.slug === 'esim-go') {
          const { syncEsimGoTopups } = await import('./services/esim-go/topup-sync');
          // eSIM Go needs API key
          const apiKey = process.env.ESIM_GO_API_KEY;

          if (!apiKey) {
            return res.status(400).json({
              success: false,
              message: 'eSIM Go API key not configured',
            });
          }

          result = await syncEsimGoTopups(provider, apiKey);
        } else {
          return res.status(400).json({
            success: false,
            message: `Topup sync not supported for ${provider.name}.`,
          });
        }

        res.json({
          success: result.success,
          message: result.success ? 'Topup sync completed successfully' : 'Topup sync failed',
          topupsSynced: result.topupsSynced || 0,
          topupsUpdated: result.topupsUpdated || 0,
          topupsSkipped: result.topupsSkipped || 0,
          errorMessage: result.errorMessage,
        });
      } catch (error: any) {
        console.error('Topup sync error:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // PUT route for updating providers (alias for PATCH)
  app.put('/api/admin/providers/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { insertProviderSchema } = await import('@shared/schema');
      const validatedData = insertProviderSchema.partial().parse(req.body);
      const provider = await storage.updateProvider(req.params.id, validatedData);

      if (!provider) {
        return res.status(404).json({ success: false, message: 'Provider not found' });
      }

      const { providerFactory } = await import('./providers/provider-factory');
      providerFactory.clearCache();

      ApiResponse.success(res, 'Provider updated successfully', provider);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, message: 'Validation error', errors: error.errors });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ADMIN - FAILOVER SETTINGS ====================

  // Get failover settings
  app.get('/api/admin/failover-settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const enabledSetting = await storage.getSettingByKey('smart_failover_enabled');
      const minMarginSetting = await storage.getSettingByKey('failover_min_margin');
      const maxAttemptsSetting = await storage.getSettingByKey('failover_max_attempts');

      res.json({
        enabled: enabledSetting?.value === 'true',
        globalMinMargin: minMarginSetting ? parseFloat(minMarginSetting.value) : 15,
        maxFailoverAttempts: maxAttemptsSetting ? parseInt(maxAttemptsSetting.value) : 3,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Update failover settings
  app.put('/api/admin/failover-settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { enabled, globalMinMargin, maxFailoverAttempts } = req.body;

      if (typeof enabled === 'boolean') {
        await storage.upsertSetting({
          key: 'smart_failover_enabled',
          value: enabled.toString(),
          category: 'ordering',
        });
      }

      if (typeof globalMinMargin === 'number') {
        await storage.upsertSetting({
          key: 'failover_min_margin',
          value: globalMinMargin.toString(),
          category: 'ordering',
        });
      }

      if (typeof maxFailoverAttempts === 'number') {
        await storage.upsertSetting({
          key: 'failover_max_attempts',
          value: maxFailoverAttempts.toString(),
          category: 'ordering',
        });
      }

      await logAdminActivity(req, 'update', 'settings', null, null, {
        settingType: 'failover',
        enabled,
        globalMinMargin,
        maxFailoverAttempts,
      });

      res.json({ success: true, message: 'Failover settings updated' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Update provider priorities (for failover order)
  app.put('/api/admin/provider-priorities', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { priorities } = req.body;

      if (!Array.isArray(priorities)) {
        return res.status(400).json({ success: false, message: 'priorities must be an array' });
      }

      for (const { id, priority } of priorities) {
        await storage.updateProvider(id, { priority });
      }

      const { providerFactory } = await import('./providers/provider-factory');
      providerFactory.clearCache();

      await logAdminActivity(req, 'update', 'providers', null, null, {
        action: 'reorder_priorities',
        priorities,
      });

      res.json({ success: true, message: 'Provider priorities updated' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ADMIN - API KEYS ====================

  // Create a new API key
  app.post('/api/admin/api-keys', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, rateLimit = 1000 } = req.body;

      if (!name) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }

      const crypto = await import('crypto');
      const bcrypt = await import('bcrypt');

      const apiKey = `esim_${crypto.randomBytes(16).toString('hex')}`;
      const apiSecret = crypto.randomBytes(32).toString('hex');

      const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const apiSecretHash = await bcrypt.hash(apiSecret, 10);
      const apiKeyPrefix = apiKey.substring(0, 12);

      const [newKey] = await db
        .insert(apiKeys)
        .values({
          name,
          apiKeyHash,
          apiSecretHash,
          apiKeyPrefix,
          isActive: true,
          rateLimit,
          requestCount: 0,
          permissions: { read: true, orders: true },
        })
        .returning();

      await logAdminActivity(req, 'create', 'api_keys', newKey.id, null, { name, rateLimit });

      res.status(201).json({
        success: true,
        apiKey,
        apiSecret,
        message: "API key created. Save the secret - it won't be shown again!",
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });


  // Get all API keys
  app.get('/api/admin/api-keys', requireAdmin, async (req: Request, res: Response) => {
    try {
      const keys = await db.query.apiKeys.findMany({
        orderBy: (apiKeys, { desc }) => [desc(apiKeys.createdAt)],
      });

      res.json(
        keys.map((k) => ({
          id: k.id,
          name: k.name,
          keyHash: k.apiKeyHash, // Keeping keyHash for backwards compatibility with UI if it expects it
          apiKeyPrefix: k.apiKeyPrefix,
          isActive: k.isActive,
          rateLimit: k.rateLimit,
          requestCount: k.requestCount,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
        })),
      );
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });


  // Update an API key
  app.put('/api/admin/api-keys/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { isActive, rateLimit, name } = req.body;

      const updates: any = {};
      if (typeof isActive === 'boolean') updates.isActive = isActive;
      if (typeof rateLimit === 'number') updates.rateLimit = rateLimit;
      if (typeof name === 'string') updates.name = name;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No valid fields to update' });
      }

      const [updated] = await db
        .update(apiKeys)
        .set(updates)
        .where(eq(apiKeys.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ success: false, message: 'API key not found' });
      }

      await logAdminActivity(req, 'update', 'api_keys', req.params.id, null, updates);

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Delete an API key
  app.delete('/api/admin/api-keys/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const [deleted] = await db.delete(apiKeys).where(eq(apiKeys.id, req.params.id)).returning();

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'API key not found' });
      }

      await logAdminActivity(req, 'delete', 'api_keys', req.params.id, null, {
        name: deleted.name,
      });

      res.json({ success: true, message: 'API key deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Test an API key
  app.post('/api/admin/api-keys/test', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { apiKey, apiSecret } = req.body;

      if (!apiKey || !apiSecret) {
        return res.status(400).json({ success: false, message: 'API key and secret are required' });
      }

      const crypto = await import('crypto');
      const bcrypt = await import('bcrypt');

      const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const keyRecord = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.apiKeyHash, apiKeyHash),
      });

      if (!keyRecord) {
        return res.status(401).json({ success: false, message: 'Invalid API key' });
      }

      if (!keyRecord.isActive) {
        return res.status(403).json({ success: false, message: 'API key is inactive' });
      }

      const isSecretValid = await bcrypt.compare(apiSecret, keyRecord.apiSecretHash);
      if (!isSecretValid) {
        return res.status(401).json({ success: false, message: 'Invalid API secret' });
      }

      res.json({
        success: true,
        message: 'Credentials are valid!',
        keyName: keyRecord.name,
        permissions: keyRecord.permissions
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ADMIN - UNIFIED PACKAGES ====================

  // Get all unified packages with full details and pagination
  // app.get('/api/admin/unified-packages', requireAdmin, async (req: Request, res: Response) => {
  //   try {
  //     // Parse pagination params
  //     const page = parseInt(req.query.page as string) || 1;
  //     const limit = parseInt(req.query.limit as string) || 50; // Default 50 items per page
  //     const offset = (page - 1) * limit;

  //     // Parse filter params
  //     const providerFilter = req.query.provider as string;
  //     const typeFilter = req.query.type as string;
  //     const destinationFilter = req.query.destination as string;
  //     const bestPriceFilter =
  //       req.query.bestPrice === 'true' ? true : req.query.bestPrice === 'false' ? false : null;
  //     const search = req.query.search as string;

  //     // Build WHERE conditions
  //     const conditions: any[] = [];

  //     // Look up provider ID from slug BEFORE query to apply filter correctly
  //     if (providerFilter && providerFilter !== 'all') {
  //       const providerRecord = await db.query.providers.findFirst({
  //         where: eq(providers.slug, providerFilter),
  //       });
  //       if (providerRecord) {
  //         conditions.push(eq(unifiedPackages.providerId, providerRecord.id));
  //       }
  //     }

  //     if (search) {
  //       conditions.push(
  //         sql`(
  //           ${unifiedPackages.title} ILIKE ${`%${search}%`} OR
  //           ${unifiedPackages.dataAmount} ILIKE ${`%${search}%`}
  //         )`,
  //       );
  //     }

  //     if (typeFilter && typeFilter !== 'all') {
  //       conditions.push(eq(unifiedPackages.type, typeFilter));
  //     }

  //     if (destinationFilter && destinationFilter !== 'all') {
  //       conditions.push(eq(unifiedPackages.destinationId, destinationFilter));
  //     }

  //     if (bestPriceFilter !== null) {
  //       conditions.push(eq(unifiedPackages.isBestPrice, bestPriceFilter));
  //     }

  //     // Build final WHERE clause
  //     const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  //     // Get total count for pagination metadata (with filters)
  //     const [countResult] = await db
  //       .select({ count: sql<number>`count(*)::int` })
  //       .from(unifiedPackages)
  //       .where(whereClause);
  //     const totalCount = countResult.count;

  //     // Fetch paginated packages (with filters applied in WHERE clause)
  //     let query = db.query.unifiedPackages.findMany({
  //       where: whereClause,
  //       with: {
  //         provider: true,
  //         destination: true,
  //         region: true,
  //       },
  //       limit,
  //       offset,
  //       orderBy: (packages, { desc }) => [desc(packages.createdAt)],
  //     });

  //     let allPackages = await query;

  //     // Transform to include provider/destination/region names and calculate dynamic pricing
  //     const packagesWithDetails = allPackages.map((pkg) => {
  //       // Calculate retail price dynamically from current provider margin
  //       const wholesalePrice = parseFloat(pkg.wholesalePrice);
  //       const providerMargin = pkg.provider ? parseFloat(pkg.provider.pricingMargin) : 0;
  //       const retailPrice = wholesalePrice * (1 + providerMargin / 100);

  //       return {
  //         ...pkg,
  //         wholesalePrice: pkg.wholesalePrice,
  //         retailPrice: retailPrice.toFixed(2), // Override with dynamically calculated price
  //         providerPrice: pkg.wholesalePrice, // Frontend expects 'providerPrice' for wholesale
  //         price: retailPrice.toFixed(2), // Frontend expects 'price' for retail
  //         providerName: pkg.provider?.name || 'Unknown',
  //         providerSlug: pkg.provider?.slug || 'unknown',
  //         destinationName: pkg.destination?.name || null,
  //         destinationFlag: pkg.destination?.flagEmoji || null,
  //         destinationCountryCode: pkg.destination?.countryCode || null,
  //         regionName: pkg.region?.name || null,
  //       };
  //     });

  //     // Calculate total stats for all packages (not just current page)
  //     const [statsResult] = await db
  //       .select({
  //         totalEnabled: sql<number>`count(*) filter (where is_enabled = true)::int`,
  //         totalBestPrice: sql<number>`count(*) filter (where is_best_price = true)::int`,
  //         totalManualOverride: sql<number>`count(*) filter (where manual_override = true)::int`,
  //       })
  //       .from(unifiedPackages);

  //     // Return paginated response with metadata and total stats
  //     res.json({
  //       data: packagesWithDetails,
  //       pagination: {
  //         page,
  //         limit,
  //         total: totalCount,
  //         totalPages: Math.ceil(totalCount / limit),
  //       },
  //       stats: {
  //         total: totalCount,
  //         enabled: statsResult.totalEnabled,
  //         bestPrice: statsResult.totalBestPrice,
  //         manualOverride: statsResult.totalManualOverride,
  //       },
  //     });
  //   } catch (error: any) {
  //     console.error('Error fetching unified packages:', error);
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  app.get("/api/admin/unified-packages", requireAdmin, async (req: Request, res: Response) => {
    try {
      // =========================
      // PAGINATION
      // =========================
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;

      // =========================
      // FILTERS
      // =========================
      const providerSlug = req.query.provider as string | null;
      const packageType = req.query.type as string | null;
      const bestPriceParam = req.query.isBestPrice as string | null;
      const sort = req.query.sort as string | null;
      const search = (req.query.search as string)?.trim();

      // Boolean filters from public API
      const filterUnlimited = req.query.isUnlimited === "true";
      const filterBestPrice = req.query.isBestPrice === "true";
      const filterPopular = req.query.isPopular === "true";

      // Package type filters
      const filterDataPack = req.query.dataPack === "true";
      const filterVoicePack = req.query.voicePack === "true";
      const filterSmsPack = req.query.smsPack === "true";
      const filterVoiceAndDataPack = req.query.voiceAndDataPack === "true";
      const filterVoiceAndSmsPack = req.query.voiceAndSmsPack === "true";
      const filterDataAndSmsPack = req.query.dataAndSmsPack === "true";
      const filterVoiceAndDataAndSmsPack = req.query.voiceAndDataAndSmsPack === "true";

      console.log("Admin packages filters:", req.query);

      // =========================
      // BUILD WHERE CLAUSE
      // =========================
      const whereClauses: any[] = [];

      // Provider filter
      if (providerSlug && providerSlug !== "all") {
        whereClauses.push(eq(providers.slug, providerSlug));
      }

      // Package type filter (local, regional, global)
      if (packageType && packageType !== "all") {
        whereClauses.push(eq(unifiedPackages.type, packageType));
      }

      // ⚠️ FIXED: Only apply isBestPrice filter if explicitly requested
      // Don't add a default "false" filter!
      if (bestPriceParam === "true") {
        whereClauses.push(eq(unifiedPackages.isBestPrice, true));
      } else if (bestPriceParam === "false") {
        whereClauses.push(eq(unifiedPackages.isBestPrice, false));
      }
      // If bestPriceParam is null or "all", don't add any filter

      // Boolean filters
      if (filterUnlimited) {
        whereClauses.push(eq(unifiedPackages.isUnlimited, true));
      }

      if (filterBestPrice) {
        whereClauses.push(eq(unifiedPackages.isBestPrice, true));
      }

      if (filterPopular) {
        whereClauses.push(eq(unifiedPackages.isPopular, true));
      }

      // ============================================================
      // Package composition filters
      // ============================================================

      if (filterDataPack) {
        whereClauses.push(
          and(
            eq(unifiedPackages.voiceMinutes, 0),
            eq(unifiedPackages.smsCount, 0),
            gt(unifiedPackages.dataMb, 0)
          )
        );
      }

      if (filterVoicePack) {
        whereClauses.push(
          and(
            eq(unifiedPackages.dataMb, 0),
            eq(unifiedPackages.smsCount, 0),
            gt(unifiedPackages.voiceMinutes, 0)
          )
        );
      }

      if (filterSmsPack) {
        whereClauses.push(
          and(
            eq(unifiedPackages.voiceMinutes, 0),
            eq(unifiedPackages.dataMb, 0),
            gt(unifiedPackages.smsCount, 0)
          )
        );
      }

      if (filterVoiceAndDataPack) {
        whereClauses.push(
          and(
            gt(unifiedPackages.voiceMinutes, 0),
            gt(unifiedPackages.dataMb, 0),
            eq(unifiedPackages.smsCount, 0)
          )
        );
      }

      if (filterVoiceAndSmsPack) {
        whereClauses.push(
          and(
            gt(unifiedPackages.voiceMinutes, 0),
            gt(unifiedPackages.smsCount, 0),
            eq(unifiedPackages.dataMb, 0)
          )
        );
      }

      if (filterDataAndSmsPack) {
        whereClauses.push(
          and(
            gt(unifiedPackages.dataMb, 0),
            gt(unifiedPackages.smsCount, 0),
            eq(unifiedPackages.voiceMinutes, 0)
          )
        );
      }

      if (filterVoiceAndDataAndSmsPack) {
        whereClauses.push(
          and(
            gt(unifiedPackages.voiceMinutes, 0),
            gt(unifiedPackages.dataMb, 0),
            gt(unifiedPackages.smsCount, 0)
          )
        );
      }

      // Search filter
      if (search) {
        const searchTerm = `%${search.toLowerCase()}%`;
        const isNumericId = !isNaN(Number(search));

        whereClauses.push(
          or(
            isNumericId
              ? eq(unifiedPackages.id, Number(search))
              : sql`CAST(${unifiedPackages.id} AS TEXT) ILIKE ${searchTerm}`,
            sql`LOWER(${unifiedPackages.slug}) ILIKE ${searchTerm}`,
            sql`LOWER(${unifiedPackages.title}) ILIKE ${searchTerm}`,
            sql`LOWER(${destinations.name}) ILIKE ${searchTerm}`,
            sql`LOWER(${regions.name}) ILIKE ${searchTerm}`,
            sql`LOWER(${providers.name}) ILIKE ${searchTerm}`
          )
        );
      }

      const whereCondition =
        whereClauses.length > 1
          ? and(...whereClauses)
          : whereClauses.length === 1
            ? whereClauses[0]
            : undefined;

      // console.log("🔍 Where Condition:", whereCondition);

      // =========================
      // SORTING
      // =========================
      let orderBy: any[];

      if (sort === "priceLowToHigh") {
        orderBy = [asc(unifiedPackages.retailPrice)];
      } else if (sort === "priceHighToLow") {
        orderBy = [desc(unifiedPackages.retailPrice)];
      } else {
        orderBy = [desc(unifiedPackages.isPopular)];
      }

      // =========================
      // GET STATISTICS (UNFILTERED)
      // =========================
      const [statsResult] = await db
        .select({
          totalEnabled: sql<number>`count(*) filter (where is_enabled = true)::int`,
          totalBestPrice: sql<number>`count(*) filter (where is_best_price = true)::int`,
          totalManualOverride: sql<number>`count(*) filter (where manual_override = true)::int`,
        })
        .from(unifiedPackages);

      // =========================
      // TOTAL COUNT (FOR PAGINATION)
      // =========================
      const countQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(unifiedPackages)
        .leftJoin(providers, eq(unifiedPackages.providerId, providers.id))
        .leftJoin(destinations, eq(unifiedPackages.destinationId, destinations.id))
        .leftJoin(regions, eq(unifiedPackages.regionId, regions.id));

      if (whereCondition) {
        countQuery.where(whereCondition);
      }

      const [{ count }] = await countQuery;
      const total = Number(count);
      const totalPages = Math.ceil(total / limit);

      console.log("📊 Total filtered packages:", total);

      // =========================
      // FETCH DATA
      // =========================
      const packagesQuery = db
        .select({
          pkg: unifiedPackages,
          provider: providers,
          destination: destinations,
          region: regions,
        })
        .from(unifiedPackages)
        .leftJoin(providers, eq(unifiedPackages.providerId, providers.id))
        .leftJoin(destinations, eq(unifiedPackages.destinationId, destinations.id))
        .leftJoin(regions, eq(unifiedPackages.regionId, regions.id))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

      if (whereCondition) {
        packagesQuery.where(whereCondition);
      }

      // DEBUG: Log the SQL
      // const countSql = countQuery.toSQL();
      // const packagesSql = packagesQuery.toSQL();
      // console.log("📊 Count Query SQL:", countSql);
      // console.log("📦 Packages Query SQL:", packagesSql);

      const unifiedPackagesData = await packagesQuery;

      console.log("📦 Returned packages:", unifiedPackagesData.length);

      // =========================
      // FORMAT RESPONSE
      // =========================
      const formattedPackages = unifiedPackagesData.map((row) => {
        const { pkg, provider, destination, region } = row;

        return {
          id: pkg.id,
          providerId: provider?.id || null,
          providerSlug: provider?.slug || null,
          providerName: provider?.name || null,
          providerPackageId: pkg.providerPackageId,
          destinationId: destination?.id || null,
          destinationName: destination?.name || null,
          destinationFlag: destination?.flagEmoji || null,
          destinationCountryCode: destination?.countryCode || null,
          regionId: region?.id || null,
          regionName: region?.name || null,
          slug: pkg.slug,
          title: pkg.title,
          dataAmount: pkg.dataAmount,
          validity: pkg.validity,
          providerPrice: pkg.wholesalePrice,
          price: pkg.retailPrice,
          currency: "USD",
          type: pkg.type,
          operator: pkg.operator,
          operatorImage: pkg.operatorImage,
          coverage: pkg.coverage || [],
          voiceCredits: pkg.voiceMinutes,
          smsCredits: pkg.smsCount,
          isBestPrice: pkg.isBestPrice,
          isPopular: pkg.isPopular,
          isTrending: pkg.isTrending,
          isRecommended: pkg.isRecommended,
          isBestValue: pkg.isBestValue,
          isUnlimited: pkg.isUnlimited,
          isEnabled: pkg.isEnabled,
          manualOverride: pkg.manualOverride,
          createdAt: pkg.createdAt,
          updatedAt: pkg.updatedAt,
        };
      });

      // =========================
      // RESPONSE
      // =========================
      res.json({
        data: formattedPackages,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        stats: {
          total: statsResult.totalEnabled,
          enabled: statsResult.totalEnabled,
          bestPrice: statsResult.totalBestPrice,
          manualOverride: statsResult.totalManualOverride,
        },
      });
    } catch (error: any) {
      console.error("🔥 Admin packages fetch error:", error);
      return ApiResponse.serverError(res, error.message);
    }
  });

  // Update a unified package (enable/disable, manual override, popular, recommended, best value)
  app.patch(
    '/api/admin/unified-packages/:id',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { isEnabled, manualOverride, isPopular, isRecommended, isBestValue } = req.body;
        const packageId = req.params.id;

        const updateData: any = {};
        if (typeof isEnabled === 'boolean') updateData.isEnabled = isEnabled;
        if (typeof manualOverride === 'boolean') updateData.manualOverride = manualOverride;
        if (typeof isPopular === 'boolean') updateData.isPopular = isPopular;
        if (typeof isRecommended === 'boolean') updateData.isRecommended = isRecommended;
        if (typeof isBestValue === 'boolean') updateData.isBestValue = isBestValue;

        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({ success: false, message: 'No valid fields to update' });
        }

        updateData.updatedAt = new Date();

        await db.update(unifiedPackages).set(updateData).where(eq(unifiedPackages.id, packageId));

        const updated = await db.query.unifiedPackages.findFirst({
          where: eq(unifiedPackages.id, packageId),
        });

        if (!updated) {
          return res.status(404).json({ success: false, message: 'Package not found' });
        }

        ApiResponse.success(res, 'Updated successfully', updated);
      } catch (error: any) {
        console.error('Error updating unified package:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // ==================== ADMIN - TOPUP PACKAGES ====================

  // Get all topup packages from all providers with filtering and pagination
  app.get('/api/admin/master-topups', requireAdmin, async (req: Request, res: Response) => {
    try {
      // Parse and validate pagination params
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      // Validate provider filter
      const providerParam = req.query.provider as string;
      const validProviders = ['all', 'airalo', 'esim-access', 'esim-go', 'maya'];
      const providerFilter = validProviders.includes(providerParam) ? providerParam : 'all';

      const search = (req.query.search as string)?.trim() || '';

      // Build conditions for Airalo
      let airaloConditions: any[] = [];
      if (search) {
        airaloConditions.push(
          sql`(${airaloTopups.title} ILIKE ${`%${search}%`} OR ${airaloTopups.dataAmount} ILIKE ${`%${search}%`})`,
        );
      }
      const airaloWhereClause = airaloConditions.length > 0 ? and(...airaloConditions) : undefined;

      // Build conditions for eSIM Access
      let esimAccessConditions: any[] = [];
      if (search) {
        esimAccessConditions.push(
          sql`(${esimAccessTopups.title} ILIKE ${`%${search}%`} OR ${esimAccessTopups.dataAmount} ILIKE ${`%${search}%`})`,
        );
      }
      const esimAccessWhereClause =
        esimAccessConditions.length > 0 ? and(...esimAccessConditions) : undefined;

      // Build conditions for eSIM Go topups
      let esimGoConditions: any[] = [];
      if (search) {
        esimGoConditions.push(
          sql`(${esimGoTopups.title} ILIKE ${`%${search}%`} OR ${esimGoTopups.dataAmount} ILIKE ${`%${search}%`})`,
        );
      }
      const esimGoWhereClause = esimGoConditions.length > 0 ? and(...esimGoConditions) : undefined;

      // Build conditions for Maya topups
      let mayaConditions: any[] = [];
      if (search) {
        mayaConditions.push(
          sql`(${mayaTopups.title} ILIKE ${`%${search}%`} OR ${mayaTopups.dataAmount} ILIKE ${`%${search}%`})`,
        );
      }
      const mayaWhereClause = mayaConditions.length > 0 ? and(...mayaConditions) : undefined;

      // Get counts for stats (always get all for stats display)
      const [airaloCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(airaloTopups)
        .where(airaloWhereClause);
      const airaloCount = airaloCountResult?.count || 0;

      const [esimAccessCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(esimAccessTopups)
        .where(esimAccessWhereClause);
      const esimAccessCount = esimAccessCountResult?.count || 0;

      const [esimGoCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(esimGoTopups)
        .where(esimGoWhereClause);
      const esimGoCount = esimGoCountResult?.count || 0;

      const [mayaCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(mayaTopups)
        .where(mayaWhereClause);
      const mayaCount = mayaCountResult?.count || 0;

      // Calculate total based on provider filter
      let totalCount = 0;
      if (providerFilter === 'airalo') {
        totalCount = airaloCount;
      } else if (providerFilter === 'esim-access') {
        totalCount = esimAccessCount;
      } else if (providerFilter === 'esim-go') {
        totalCount = esimGoCount;
      } else if (providerFilter === 'maya') {
        totalCount = mayaCount;
      } else {
        totalCount = airaloCount + esimAccessCount + esimGoCount + mayaCount;
      }

      // Fetch data based on provider filter with proper pagination
      let allTopups: any[] = [];

      if (providerFilter === 'airalo') {
        // Only fetch Airalo with proper pagination and parent package info
        const airaloData = await db
          .select({
            id: airaloTopups.id,
            title: airaloTopups.title,
            dataAmount: airaloTopups.dataAmount,
            validity: airaloTopups.validity,
            price: airaloTopups.price,
            airaloPrice: airaloTopups.airaloPrice,
            currency: airaloTopups.currency,
            type: airaloTopups.type,
            operator: airaloTopups.operator,
            operatorImage: airaloTopups.operatorImage,
            active: airaloTopups.active,
            createdAt: airaloTopups.createdAt,
            destinationName: destinations.name,
            regionName: regions.name,
            parentPackageId: airaloTopups.parentPackageId,
            parentOperator: airaloTopups.parentOperator,
          })
          .from(airaloTopups)
          .leftJoin(destinations, eq(airaloTopups.destinationId, destinations.id))
          .leftJoin(regions, eq(airaloTopups.regionId, regions.id))
          .where(airaloWhereClause)
          .orderBy(desc(airaloTopups.createdAt))
          .limit(limit)
          .offset(offset);

        allTopups = airaloData.map((t) => ({
          ...t,
          provider: 'airalo',
          providerName: 'Airalo',
          hasParentPackage: !!t.parentPackageId,
        }));
      } else if (providerFilter === 'esim-access') {
        // Only fetch eSIM Access with proper pagination and parent package info
        const esimAccessData = await db
          .select({
            id: esimAccessTopups.id,
            title: esimAccessTopups.title,
            dataAmount: esimAccessTopups.dataAmount,
            validity: esimAccessTopups.validity,
            price: esimAccessTopups.wholesalePrice,
            currency: esimAccessTopups.currency,
            type: esimAccessTopups.type,
            operator: esimAccessTopups.operator,
            operatorImage: esimAccessTopups.operatorImage,
            active: esimAccessTopups.active,
            createdAt: esimAccessTopups.createdAt,
            destinationName: destinations.name,
            regionName: regions.name,
            parentPackageId: esimAccessTopups.parentPackageId,
            basePackageCode: esimAccessTopups.basePackageCode,
          })
          .from(esimAccessTopups)
          .leftJoin(destinations, eq(esimAccessTopups.destinationId, destinations.id))
          .leftJoin(regions, eq(esimAccessTopups.regionId, regions.id))
          .where(esimAccessWhereClause)
          .orderBy(desc(esimAccessTopups.createdAt))
          .limit(limit)
          .offset(offset);

        allTopups = esimAccessData.map((t) => ({
          ...t,
          provider: 'esim-access',
          providerName: 'eSIM Access',
          hasParentPackage: !!t.parentPackageId,
        }));
      } else if (providerFilter === 'esim-go') {
        // Fetch eSIM Go topups from dedicated topups table
        const esimGoData = await db
          .select({
            id: esimGoTopups.id,
            title: esimGoTopups.title,
            dataAmount: esimGoTopups.dataAmount,
            validity: esimGoTopups.validity,
            price: esimGoTopups.wholesalePrice,
            currency: esimGoTopups.currency,
            type: esimGoTopups.type,
            operator: esimGoTopups.operator,
            operatorImage: esimGoTopups.operatorImage,
            active: esimGoTopups.active,
            createdAt: esimGoTopups.createdAt,
            destinationName: destinations.name,
            regionName: regions.name,
            parentPackageId: esimGoTopups.parentPackageId,
            parentBundleId: esimGoTopups.parentBundleId,
          })
          .from(esimGoTopups)
          .leftJoin(destinations, eq(esimGoTopups.destinationId, destinations.id))
          .leftJoin(regions, eq(esimGoTopups.regionId, regions.id))
          .where(esimGoWhereClause)
          .orderBy(desc(esimGoTopups.createdAt))
          .limit(limit)
          .offset(offset);

        allTopups = esimGoData.map((t) => ({
          ...t,
          provider: 'esim-go',
          providerName: 'eSIM Go',
          parentOperator: t.parentBundleId,
          hasParentPackage: !!t.parentPackageId,
        }));
      } else if (providerFilter === 'maya') {
        // Fetch Maya topups
        const mayaData = await db
          .select({
            id: mayaTopups.id,
            title: mayaTopups.title,
            dataAmount: mayaTopups.dataAmount,
            validity: mayaTopups.validity,
            price: mayaTopups.wholesalePrice,
            currency: mayaTopups.currency,
            type: mayaTopups.type,
            active: mayaTopups.active,
            createdAt: mayaTopups.createdAt,
            destinationName: destinations.name,
            regionName: regions.name,
            parentPackageId: mayaTopups.parentPackageId,
          })
          .from(mayaTopups)
          .leftJoin(destinations, eq(mayaTopups.destinationId, destinations.id))
          .leftJoin(regions, eq(mayaTopups.regionId, regions.id))
          .where(mayaWhereClause)
          .orderBy(desc(mayaTopups.createdAt))
          .limit(limit)
          .offset(offset);

        allTopups = mayaData.map((t) => ({
          ...t,
          provider: 'maya',
          providerName: 'Maya Mobile',
          operator: null,
          operatorImage: null,
          parentOperator: null,
          hasParentPackage: !!t.parentPackageId,
        }));
      } else {
        // Combined view: use raw SQL UNION ALL for proper unified pagination
        const searchPattern = search ? `%${search}%` : null;

        const combinedQuery = sql`
          SELECT * FROM (
            SELECT 
              airalo_topups.id, airalo_topups.title, airalo_topups.data_amount as "dataAmount", airalo_topups.validity, 
              airalo_topups.price, airalo_topups.currency, airalo_topups.type, airalo_topups.operator, airalo_topups.operator_image as "operatorImage",
              airalo_topups.active, airalo_topups.created_at as "createdAt",
              'airalo' as provider, 'Airalo' as "providerName",
              (SELECT destinations.name FROM destinations WHERE destinations.id = airalo_topups.destination_id) as "destinationName",
              (SELECT regions.name FROM regions WHERE regions.id = airalo_topups.region_id) as "regionName",
              airalo_topups.parent_package_id as "parentPackageId",
              airalo_topups.parent_operator as "parentOperator",
              CASE WHEN airalo_topups.parent_package_id IS NOT NULL THEN true ELSE false END as "hasParentPackage"
            FROM airalo_topups
            ${searchPattern ? sql`WHERE airalo_topups.title ILIKE ${searchPattern} OR airalo_topups.data_amount ILIKE ${searchPattern}` : sql``}
            UNION ALL
            SELECT 
              esim_access_topups.id, esim_access_topups.title, esim_access_topups.data_amount as "dataAmount", esim_access_topups.validity,
              esim_access_topups.wholesale_price as price, esim_access_topups.currency, esim_access_topups.type, esim_access_topups.operator, esim_access_topups.operator_image as "operatorImage",
              esim_access_topups.active, esim_access_topups.created_at as "createdAt",
              'esim-access' as provider, 'eSIM Access' as "providerName",
              (SELECT destinations.name FROM destinations WHERE destinations.id = esim_access_topups.destination_id) as "destinationName",
              (SELECT regions.name FROM regions WHERE regions.id = esim_access_topups.region_id) as "regionName",
              esim_access_topups.parent_package_id as "parentPackageId",
              esim_access_topups.base_package_code as "parentOperator",
              CASE WHEN esim_access_topups.parent_package_id IS NOT NULL THEN true ELSE false END as "hasParentPackage"
            FROM esim_access_topups
            ${searchPattern ? sql`WHERE esim_access_topups.title ILIKE ${searchPattern} OR esim_access_topups.data_amount ILIKE ${searchPattern}` : sql``}
            UNION ALL
            SELECT 
              esim_go_topups.id, esim_go_topups.title, esim_go_topups.data_amount as "dataAmount", esim_go_topups.validity,
              esim_go_topups.wholesale_price as price, esim_go_topups.currency, esim_go_topups.type, esim_go_topups.operator, esim_go_topups.operator_image as "operatorImage",
              esim_go_topups.active as active, esim_go_topups.created_at as "createdAt",
              'esim-go' as provider, 'eSIM Go' as "providerName",
              (SELECT destinations.name FROM destinations WHERE destinations.id = esim_go_topups.destination_id) as "destinationName",
              (SELECT regions.name FROM regions WHERE regions.id = esim_go_topups.region_id) as "regionName",
              esim_go_topups.parent_package_id as "parentPackageId",
              esim_go_topups.parent_bundle_id as "parentOperator",
              CASE WHEN esim_go_topups.parent_package_id IS NOT NULL THEN true ELSE false END as "hasParentPackage"
            FROM esim_go_topups
            ${searchPattern ? sql`WHERE esim_go_topups.title ILIKE ${searchPattern} OR esim_go_topups.data_amount ILIKE ${searchPattern}` : sql``}
            UNION ALL
            SELECT 
              maya_topups.id, maya_topups.title, maya_topups.data_amount as "dataAmount", maya_topups.validity,
              maya_topups.wholesale_price as price, maya_topups.currency, maya_topups.type, NULL as operator, NULL as "operatorImage",
              maya_topups.active as active, maya_topups.created_at as "createdAt",
              'maya' as provider, 'Maya Mobile' as "providerName",
              (SELECT destinations.name FROM destinations WHERE destinations.id = maya_topups.destination_id) as "destinationName",
              (SELECT regions.name FROM regions WHERE regions.id = maya_topups.region_id) as "regionName",
              maya_topups.parent_package_id as "parentPackageId",
              NULL as "parentOperator",
              CASE WHEN maya_topups.parent_package_id IS NOT NULL THEN true ELSE false END as "hasParentPackage"
            FROM maya_topups
            ${searchPattern ? sql`WHERE maya_topups.title ILIKE ${searchPattern} OR maya_topups.data_amount ILIKE ${searchPattern}` : sql``}
          ) combined
          ORDER BY "createdAt" DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `;

        const combinedResults = await db.execute(combinedQuery);
        allTopups = combinedResults.rows as any[];
      }

      res.json({
        success: true,
        data: allTopups,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        stats: {
          airalo: airaloCount,
          esimAccess: esimAccessCount,
          esimGo: esimGoCount,
          maya: mayaCount,
          total: airaloCount + esimAccessCount + esimGoCount + mayaCount,
        },
      });
    } catch (error: any) {
      console.error('Error fetching master topups:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ADMIN - PAGES ====================

  // Pages Management
  // app.get("/api/admin/pages", requireAdmin, async (req: Request, res: Response) => {
  //   try {
  //     const pages = await storage.getAllPages();
  //     ApiResponse.success(res, "Pages retrieved successfully", pages);
  //   } catch (error: any) {
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // app.get("/api/pages", async (req: Request, res: Response) => {
  //   try {
  //     const pages = await storage.getPublishedPages();
  //     ApiResponse.success(res, "Pages retrieved successfully", pages);
  //   } catch (error: any) {
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // app.get("/api/pages/:slug", async (req: Request, res: Response) => {
  //   try {
  //     const page = await storage.getPageBySlug(req.params.slug);
  //     if (!page) {
  //       return res.status(404).json({ success: false, message: "Page not found" });
  //     }
  //     // Allow admins to view unpublished pages
  //     const isAdmin = req.session?.adminId;
  //     if (!page.published && !isAdmin) {
  //       return res.status(404).json({ success: false, message: "Page not found" });
  //     }
  //     ApiResponse.success(res, "Page operation successful", page);
  //   } catch (error: any) {
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // app.post("/api/admin/pages", requireAdmin, async (req: Request, res: Response) => {
  //   try {
  //     const validatedData = insertPageSchema.parse(req.body);
  //     const page = await storage.createPage(validatedData);
  //     ApiResponse.success(res, "Page operation successful", page);
  //   } catch (error: any) {
  //     if (error.name === "ZodError") {
  //       return res.status(400).json({ success: false, message: "Validation error", errors: error.errors });
  //     }
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // app.put("/api/admin/pages/:id", requireAdmin, async (req: Request, res: Response) => {
  //   try {
  //     const validatedData = insertPageSchema.partial().parse(req.body);
  //     const page = await storage.updatePage(req.params.id, validatedData);
  //     if (!page) {
  //       return res.status(404).json({ success: false, message: "Page not found" });
  //     }
  //     ApiResponse.success(res, "Page operation successful", page);
  //   } catch (error: any) {
  //     if (error.name === "ZodError") {
  //       return res.status(400).json({ success: false, message: "Validation error", errors: error.errors });
  //     }
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // app.delete("/api/admin/pages/:id", requireAdmin, async (req: Request, res: Response) => {
  //   try {
  //     await storage.deletePage(req.params.id);
  //     res.json({ success: true, message: "Page deleted successfully" });
  //   } catch (error: any) {
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  // Sync packages from Airalo
  app.post('/api/admin/sync-packages', requireAdmin, async (req: Request, res: Response) => {
    try {
      console.log('🚀 Starting Airalo package sync...');
      const result = await airaloSyncService.syncAll();

      res.json({
        success: true,
        message: 'Airalo sync completed successfully',
        stats: {
          countries: {
            created: result.countries.created,
            updated: result.countries.updated,
            errors: result.countries.errors.length,
          },
          packages: {
            created: result.packages.created,
            updated: result.packages.updated,
            skipped: result.packages.skipped,
            errors: result.packages.errors.length,
          },
        },
        errors: result.totalErrors.length > 0 ? result.totalErrors : undefined,
      });
    } catch (error: any) {
      console.error('❌ Sync failed:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to sync packages from Airalo',
      });
    }
  });

  // ==================== CUSTOMER PROFILE ROUTES ====================

  // ==================== KYC ROUTES ====================

  // Upload KYC document
  app.post(
    '/api/kyc/upload',
    requireAuth,
    upload.single('document'),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.file) {
        throw new ValidationError('No file uploaded', 'document');
      }

      const { documentType } = req.body;
      if (!documentType) {
        throw new ValidationError('Document type is required', 'documentType');
      }

      // 👇 Use req.userId instead of req.session.userId
      const userId = req.userId!;

      console.log('Uploading KYC document for userId:', userId, req);

      const document = await storage.createKycDocument({
        userId,
        documentType,
        filePath: req.file.path,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        status: 'pending',
      });

      await storage.updateUser(userId, { kycStatus: 'submitted' });

      logger.info('KYC document uploaded', {
        userId,
        documentType,
      });

      return ApiResponse.created(res, 'KYC document uploaded successfully', { document });
    }),
  );

  // Get user's KYC documents
  app.get('/api/kyc/documents', requireAuth, async (req: Request, res: Response) => {
    try {
      const documents = await storage.getKycDocumentsByUser(req.session.userId!);

      // Normalize file paths to be relative URLs for the frontend
      const normalizedDocuments = documents.map((doc: any) => {
        let relativePath = doc.filePath;
        if (relativePath.includes('uploads/kyc/')) {
          relativePath = '/uploads/kyc/' + relativePath.split('uploads/kyc/')[1];
        } else if (relativePath.includes('uploads\\kyc\\')) {
          relativePath = '/uploads/kyc/' + relativePath.split('uploads\\kyc\\')[1].replace(/\\/g, '/');
        } else if (!relativePath.startsWith('/')) {
          relativePath = '/' + relativePath;
        }

        return {
          ...doc,
          filePath: relativePath
        };
      });

      ApiResponse.success(res, 'Documents retrieved successfully', normalizedDocuments);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get user's orders (active and expired)

  // ==================== ADMIN - CUSTOMER MANAGEMENT ====================

  // Get all customers
  app.get('/api/admin/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const customers = await storage.getAllUsers();
      ApiResponse.success(res, 'Customers retrieved successfully', customers);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get customer details
  app.get('/api/admin/customers/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const customerData = await storage.getUserWithDetails(req.params.id);
      if (!customerData) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }

      const { logActivity, ActivityActions } = await import('./middleware/activity-logger');
      await logActivity(req, ActivityActions.CUSTOMER_VIEWED, 'user', req.params.id);

      ApiResponse.success(res, 'Customer data retrieved successfully', customerData);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ADMIN - KYC MANAGEMENT ====================

  // Get KYC requests (supports status filter)
  app.get('/api/admin/kyc/pending', requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string || 'pending';
      const requests = await storage.getPendingKycRequests(status);

      // Normalize file paths for preview
      const normalizedRequests = requests.map((req: any) => {
        let relativePath = req.filePath;
        if (relativePath.includes('uploads/kyc/')) {
          relativePath = '/uploads/kyc/' + relativePath.split('uploads/kyc/')[1];
        } else if (relativePath.includes('uploads\\kyc\\')) {
          relativePath = '/uploads/kyc/' + relativePath.split('uploads\\kyc\\')[1].replace(/\\/g, '/');
        } else if (!relativePath.startsWith('/')) {
          relativePath = '/' + relativePath;
        }

        return {
          ...req,
          filePath: relativePath
        };
      });

      ApiResponse.success(res, 'Requests retrieved successfully', normalizedRequests);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Approve KYC
  app.post('/api/admin/kyc/:id/approve', requireAdmin, async (req: Request, res: Response) => {
    try {
      const doc = await storage.updateKycDocument(req.params.id, { status: 'approved' });
      if (!doc) {
        return res.status(404).json({ success: false, message: 'KYC document not found' });
      }

      // Update user KYC status
      await storage.updateUser(doc.userId, {
        kycStatus: 'approved',
        kycReviewedAt: new Date(),
        kycReviewedBy: req.session.adminId,
      });

      // Create notification
      await storage.createNotification({
        userId: doc.userId,
        type: 'kyc_approved',
        title: 'KYC Approved',
        message: 'Your KYC verification has been approved. You can now use all features.',
        metadata: { documentId: doc.id },
      });

      const { logActivity, ActivityActions } = await import('./middleware/activity-logger');
      await logActivity(req, ActivityActions.KYC_APPROVED, 'kyc', doc.id, { userId: doc.userId });

      res.json({ success: true, message: 'KYC approved successfully', data: { document: doc } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Reject KYC
  app.post('/api/admin/kyc/:id/reject', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, message: 'Rejection reason is required' });
      }

      const doc = await storage.updateKycDocument(req.params.id, {
        status: 'rejected',
        rejectionReason: reason,
      });

      if (!doc) {
        return res.status(404).json({ success: false, message: 'KYC document not found' });
      }

      // Update user KYC status
      await storage.updateUser(doc.userId, {
        kycStatus: 'rejected',
        kycRejectionReason: reason,
        kycReviewedAt: new Date(),
        kycReviewedBy: req.session.adminId,
      });

      // Create notification
      await storage.createNotification({
        userId: doc.userId,
        type: 'kyc_rejected',
        title: 'KYC Rejected',
        message: `Your KYC verification was rejected. Reason: ${reason}`,
        metadata: { documentId: doc.id, reason },
      });

      const { logActivity, ActivityActions } = await import('./middleware/activity-logger');
      await logActivity(req, ActivityActions.KYC_REJECTED, 'kyc', doc.id, {
        userId: doc.userId,
        reason,
      });

      res.json({ success: true, message: 'KYC rejected successfully', data: { document: doc } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== REVIEW ROUTES ====================

  // Public: Get approved reviews for a package

  // Customer: Submit a review
  app.post('/api/reviews', requireAuth, async (req: Request, res: Response) => {
    try {
      const validatedData = insertReviewSchema.parse(req.body);

      console.log('validatedData', validatedData, req.userId);

      // Validate rating
      if (validatedData.rating < 1 || validatedData.rating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
      }

      // Validate title length
      if (!validatedData.title || validatedData.title.length < 10) {
        return res
          .status(400)
          .json({ success: false, message: 'Title must be at least 10 characters' });
      }

      // Validate comment length
      if (!validatedData.comment || validatedData.comment.length < 50) {
        return res
          .status(400)
          .json({ success: false, message: 'Comment must be at least 50 characters' });
      }

      // Check if user has already reviewed this package
      const existingReview = await db.query.reviews.findFirst({
        where: and(eq(reviews.userId, req.userId!), eq(reviews.packageId, validatedData.packageId)),
      });

      if (existingReview) {
        return res
          .status(400)
          .json({ success: false, message: 'You have already reviewed this package' });
      }

      // Check if user has purchased this package
      const userOrder = await db.query.orders.findFirst({
        where: and(
          eq(orders.userId, req.userId!),
          eq(orders.packageId, validatedData.packageId),
          eq(orders.status, 'completed'),
        ),
      });

      const reviewData = {
        ...validatedData,
        userId: req.userId!,
        orderId: userOrder?.id || null,
        isVerifiedPurchase: !!userOrder,
        isApproved: false,
      };

      const [newReview] = await db.insert(reviews).values(reviewData).returning();

      res.status(201).json(newReview);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid review data', errors: error.errors });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // get reviews for userId
  app.get('/api/reviews', requireAuth, async (req: Request, res: Response) => {
    try {
      const { packageId } = req.query;
      const userId = req.userId!;
      const reviewsData = await db.query.reviews.findMany({
        where: and(eq(reviews.packageId, packageId), eq(reviews.userId, userId)),
      });
      res.json(reviewsData);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Customer: Update own review
  app.put('/api/reviews/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const review = await db.query.reviews.findFirst({
        where: eq(reviews.id, req.params.id),
      });

      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }

      if (review.userId !== req.session.userId) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }

      // Check if review is approved or older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      if (review.isApproved && review.createdAt < sevenDaysAgo) {
        return res
          .status(403)
          .json({ success: false, message: 'Cannot edit approved review older than 7 days' });
      }

      const { title, comment, rating, pros, cons } = req.body;

      // Validate if provided
      if (title && title.length < 10) {
        return res
          .status(400)
          .json({ success: false, message: 'Title must be at least 10 characters' });
      }

      if (comment && comment.length < 50) {
        return res
          .status(400)
          .json({ success: false, message: 'Comment must be at least 50 characters' });
      }

      if (rating && (rating < 1 || rating > 5)) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
      }

      const [updatedReview] = await db
        .update(reviews)
        .set({
          title: title || review.title,
          comment: comment || review.comment,
          rating: rating || review.rating,
          pros: pros !== undefined ? pros : review.pros,
          cons: cons !== undefined ? cons : review.cons,
          isApproved: false, // Reset approval status after edit
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, req.params.id))
        .returning();

      ApiResponse.success(res, 'Review updated successfully', updatedReview);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Customer: Delete own review
  app.delete('/api/reviews/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const review = await db.query.reviews.findFirst({
        where: eq(reviews.id, req.params.id),
      });

      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }

      if (review.userId !== req.session.userId) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }

      await db.delete(reviews).where(eq(reviews.id, req.params.id));

      res.json({ success: true, message: 'Review deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Customer: Mark review as helpful
  app.post('/api/reviews/:id/helpful', requireAuth, async (req: Request, res: Response) => {
    try {
      const review = await db.query.reviews.findFirst({
        where: eq(reviews.id, req.params.id),
      });

      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }

      // Increment helpful count
      const [updatedReview] = await db
        .update(reviews)
        .set({
          helpfulCount: sql`${reviews.helpfulCount} + 1`,
        })
        .where(eq(reviews.id, req.params.id))
        .returning();

      ApiResponse.success(res, 'Review updated successfully', updatedReview);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Get all reviews (pending + approved)
  app.get('/api/admin/reviews', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, rating, search, page = '1', sortBy = 'newest' } = req.query;
      const limit = 20;
      const offset = (parseInt(page as string) - 1) * limit;

      let whereConditions: any[] = [];

      if (status === 'pending') {
        whereConditions.push(eq(reviews.isApproved, false));
      } else if (status === 'approved') {
        whereConditions.push(eq(reviews.isApproved, true));
      }
      // "all" or empty means no status filter

      if (rating && rating !== 'all') {
        whereConditions.push(eq(reviews.rating, parseInt(rating as string)));
      }

      if (search) {
        whereConditions.push(
          or(ilike(reviews.title, `%${search}%`), ilike(reviews.comment, `%${search}%`)),
        );
      }

      let orderBy;
      if (sortBy === 'oldest') {
        orderBy = [asc(reviews.createdAt)];
      } else if (sortBy === 'rating-high') {
        orderBy = [desc(reviews.rating), desc(reviews.createdAt)];
      } else if (sortBy === 'rating-low') {
        orderBy = [asc(reviews.rating), desc(reviews.createdAt)];
      } else {
        orderBy = [desc(reviews.createdAt)];
      }

      const reviewsData = await db.query.reviews.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
          package: {
            columns: {
              id: true,
              title: true,
              customImage: true,
            },
            with: {
              destination: {
                columns: {
                  name: true,
                  flagEmoji: true,
                },
              },
            },
          },
        },
        limit,
        offset,
        orderBy,
      });

      const total = await db
        .select({ count: sql<number>`count(*)` })
        .from(reviews)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

      res.json({
        reviews: reviewsData,
        total: total[0]?.count || 0,
        page: parseInt(page as string),
        totalPages: Math.ceil((total[0]?.count || 0) / limit),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Get review statistics
  app.get('/api/admin/reviews/stats', requireAdmin, async (req: Request, res: Response) => {
    try {
      const totalReviews = await db.select({ count: sql<number>`count(*)` }).from(reviews);

      const pendingReviews = await db
        .select({ count: sql<number>`count(*)` })
        .from(reviews)
        .where(eq(reviews.isApproved, false));

      const avgRating = await db
        .select({
          avg: sql<number>`avg(${reviews.rating})`,
        })
        .from(reviews)
        .where(eq(reviews.isApproved, true));

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentReviews = await db
        .select({ count: sql<number>`count(*)` })
        .from(reviews)
        .where(gte(reviews.createdAt, sevenDaysAgo));

      res.json({
        total: totalReviews[0]?.count || 0,
        pending: pendingReviews[0]?.count || 0,
        averageRating: Math.round((avgRating[0]?.avg || 0) * 10) / 10,
        recent: recentReviews[0]?.count || 0,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Create review
  app.post('/api/admin/reviews', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { insertReviewSchema } = await import('@shared/schema');

      const data = insertReviewSchema.parse({
        ...req.body,
        approvedBy: req.admin?.id,
        approvedAt: new Date(),
      });

      const [review] = await db.insert(reviews).values(data).returning();

      res.status(201).json(review);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Approve review
  app.post('/api/admin/reviews/:id/approve', requireAdmin, async (req: Request, res: Response) => {
    try {
      const review = await db.query.reviews.findFirst({
        where: eq(reviews.id, req.params.id),
      });

      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }

      const [updatedReview] = await db
        .update(reviews)
        .set({
          isApproved: true,
          approvedBy: req.session.adminId!,
          approvedAt: new Date(),
        })
        .where(eq(reviews.id, req.params.id))
        .returning();

      res.json({
        success: true,
        message: 'Review approved successfully',
        data: { review: updatedReview },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Delete review
  app.delete('/api/admin/reviews/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const review = await db.query.reviews.findFirst({
        where: eq(reviews.id, req.params.id),
      });

      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }

      await db.delete(reviews).where(eq(reviews.id, req.params.id));

      res.json({ success: true, message: 'Review deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== eSIM MANAGEMENT APIs ====================

  // Middleware: Require either customer auth OR admin auth
  const requireAuthOrAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId && !req.session.adminId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    next();
  };

  // Get eSIM details for an order (Customer & Admin)

  // Get installation instructions for eSIM
  app.get('/api/esims/:iccid/instructions', requireAuth, async (req: Request, res: Response) => {
    try {
      const { iccid } = req.params;
      if (!iccid || iccid === 'undefined') {
        return res.status(400).json({ success: false, message: 'Invalid ICCID' });
      }

      const { language = 'en', device, model } = req.query;

      const { esimService } = await import('./services/esim');
      const instructions = await esimService.getInstallationInstructions(
        req.params.iccid,
        language as string,
        device as string | undefined,
        model as string | undefined,
      );

      res.json({ instructions });
    } catch (error: any) {
      console.error('Error fetching installation instructions:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get eSIM data usage (READ ONLY)
  app.get('/api/esims/:iccid/usage', requireAuth, async (req: Request, res: Response) => {
    try {
      const order = await storage.getOrderByIccid(req.params.iccid);

      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      // optional: security check
      // if (order.userId !== req.user.id) {
      //   return res.status(403).json({ success: false, message: "Forbidden" });
      // }

      const { providerFactory } = await import('./providers/provider-factory');
      const providerService = await providerFactory.getServiceById(order.providerId);

      const usage = await providerService.getUsageData(order.iccid);

      return res.json({
        success: true,
        usage,
      });
    } catch (error: any) {
      console.error('Error fetching eSIM usage:', error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  // Get available top-up packages for eSIM
  app.get('/api/esims/:iccid/topup-packages', requireAuth, async (req: Request, res: Response) => {
    try {
      const order = await storage.getOrderByIccid(req.params.iccid);

      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      console.log(
        '[Topup Packages] Fetching for ICCID:',
        req.params.iccid,
        'Provider:',
        order.providerId,
      );

      if (!order.providerId) {
        return res.status(400).json({ success: false, message: 'Order has no provider assigned' });
      }

      const { providerFactory } = await import('./providers/provider-factory');
      const providerService = await providerFactory.getServiceById(order.providerId);
      const topupData = await providerService.getTopupPackages(order.iccid!);

      console.log('[Topup Packages] Provider returned:', JSON.stringify(topupData).slice(0, 500));

      // Extract packages array from response
      // - Airalo API returns {data: [...]}
      // - eSIM Access returns array directly
      // - Other providers may return different formats
      const topupDataAny = topupData as any;
      const packages = Array.isArray(topupDataAny?.data)
        ? topupDataAny.data
        : Array.isArray(topupData)
          ? topupData
          : [];

      console.log('[Topup Packages] Extracted', packages.length, 'packages');

      // Apply top-up margin to prices
      const topupMarginSetting = await storage.getSettingByKey('topup_margin');
      const topupMargin = parseFloat(topupMarginSetting?.value || '40'); // Default 40%

      const packagesWithMargin = packages.map((pkg: any) => ({
        ...pkg,
        // Use provider's wholesale price (various field names)
        provider_price: pkg.net_price || pkg.wholesalePrice || pkg.price,
        // Calculate retail price with margin
        price: pkg.net_price
          ? parseFloat((pkg.net_price * (1 + topupMargin / 100)).toFixed(2))
          : pkg.wholesalePrice
            ? parseFloat((pkg.wholesalePrice * (1 + topupMargin / 100)).toFixed(2))
            : pkg.price,
        data: pkg.data || pkg.dataAmount || `${pkg.amount || 0} MB`,
        validity: pkg.day || pkg.validity || 0,
      }));

      res.json({ packages: packagesWithMargin, topupMargin, providerId: order.providerId });
    } catch (error: any) {
      console.error('[Topup Packages] Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Submit top-up order
  app.post('/api/topups', requireAuthOrAdmin, async (req: Request, res: Response) => {
    try {
      const { orderId, packageId, iccid } = req.body;

      if (!orderId || !packageId || !iccid) {
        return res
          .status(400)
          .json({ success: false, message: 'orderId, packageId, and iccid are required' });
      }

      // Verify order belongs to user
      const order = await storage.getOrderById(orderId);
      if (!order || (order.userId !== req.session.userId && !req.session.adminId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      // Get package details and top-up margin
      const pkg = await storage.getPackageById(packageId);
      if (!pkg) {
        return res.status(404).json({ success: false, message: 'Package not found' });
      }

      const topupMarginSetting = await storage.getSettingByKey('topup_margin');
      const topupMargin = parseFloat(topupMarginSetting?.value || '40');

      const airaloPrice = pkg.airaloPrice ? parseFloat(pkg.airaloPrice.toString()) : 0;
      const customerPrice = parseFloat((airaloPrice * (1 + topupMargin / 100)).toFixed(2));

      // Submit top-up to Airalo
      const response = await airaloAPI.submitTopup(iccid, packageId, `Topup-${orderId}`);

      // Create top-up record
      const topup = await storage.createTopup({
        orderId,
        userId: req.session.userId || order.userId!,
        packageId,
        iccid,
        airaloTopupId: response.data?.id?.toString(),
        status: 'completed',
        price: customerPrice.toString(),
        airaloPrice: airaloPrice.toString(),
        currency: 'USD',
        dataAmount: pkg.dataAmount,
        validity: pkg.validity,
        webhookReceivedAt: new Date(),
      });

      // Create in-app notification for successful top-up
      const topupUserId = req.session.userId || order.userId!;
      if (topupUserId) {
        const user = await storage.getUser(topupUserId);
        if (user) {
          await storage.createNotification({
            userId: topupUserId,
            type: 'topup',
            title: 'Top-Up Successful',
            message: `Your eSIM has been topped up with ${pkg.dataAmount} for ${pkg.validity} days. Stay connected!`,
            read: false,
            metadata: { topupId: topup.id, orderId, iccid, packageId },
          });

          console.log(`✅ In-app notification created for user ${user.email}`);
        }
      }

      res.json({ success: true, message: 'Top-up successful', data: { topup } });
    } catch (error: any) {
      console.error('Error submitting top-up:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Manual status refresh for order (Admin only)
  app.post(
    '/api/admin/orders/:orderId/refresh-status',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { orderStatusService } = await import('./services/order-status');
        const updated = await orderStatusService.checkSingleOrderStatus(req.params.orderId);

        if (updated) {
          res.json({ success: true, message: 'Order status updated successfully' });
        } else {
          res.json({ success: true, message: 'No updates available for this order' });
        }
      } catch (error: any) {
        console.error('Error refreshing order status:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Manual fetch all pending orders (Admin only)
  app.post('/api/admin/orders/fetch-pending', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { orderStatusService } = await import('./services/order-status');
      const result = await orderStatusService.checkPendingOrdersStatus();

      res.json({
        message: `Checked ${result.checked} orders: ${result.updated} updated, ${result.failed} failed`,
        ...result,
      });
    } catch (error: any) {
      console.error('Error fetching pending orders:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // NOTE: Refund endpoint moved to server/routes/admin/orders.ts using RefundService
  // POST /api/admin/orders/:id/refund - uses RefundService with proper error handling

  // Get eSIMs list (Admin only)
  app.get('/api/admin/esims', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { orderId, iccid, dateRange, limit, page } = req.query;

      const { esimService } = await import('./services/esim');
      const esims = await esimService.getESimsList({
        orderId: orderId as string | undefined,
        iccid: iccid as string | undefined,
        dateRange: dateRange as string | undefined,
        limit: limit ? parseInt(limit as string) : 50,
        page: page ? parseInt(page as string) : 1,
      });

      res.json({ esims });
    } catch (error: any) {
      console.error('Error fetching eSIMs list:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get comprehensive eSIM information with multi-language support
  app.get('/api/esims/:iccid/info', requireAuthOrAdmin, async (req: Request, res: Response) => {
    try {
      const { language = 'en' } = req.query;

      const { esimService } = await import('./services/esim');
      const info = await esimService.getSimInfo(req.params.iccid, language as string);

      res.json({ info });
    } catch (error: any) {
      console.error('Error fetching eSIM info:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get branded QR code for eSIM
  app.get(
    '/api/esims/:iccid/branded-qr',
    requireAuthOrAdmin,
    async (req: Request, res: Response) => {
      try {
        const { brandName } = req.query;

        const { esimService } = await import('./services/esim');
        const qrData = await esimService.getBrandedQRCode(
          req.params.iccid,
          brandName as string | undefined,
        );

        res.json({ qrCode: qrData });
      } catch (error: any) {
        console.error('Error fetching branded QR code:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Update eSIM brand settings (Admin only)
  app.put('/api/admin/esims/:iccid/brand', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { brandName } = req.body;

      if (!brandName) {
        return res.status(400).json({ success: false, message: 'brandName is required' });
      }

      const { esimService } = await import('./services/esim');
      const result = await esimService.updateBrandSettings(req.params.iccid, brandName);

      res.json({ success: true, message: 'Brand updated successfully', data: { result } });
    } catch (error: any) {
      console.error('Error updating eSIM brand:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get top-ups list (Admin only)
  app.get('/api/admin/topups', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { page, limit, search, status } = req.query;
      const result = await storage.getTopups({
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 10,
        search: search as string,
        status: status as string,
      });

      res.json({
        topups: result.data,
        pagination: result.pagination,
        stats: result.stats
      });
    } catch (error: any) {
      console.error('Error fetching top-ups:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get customer's top-ups

  // ==================== ADMIN NOTIFICATION MANAGEMENT ====================

  // Get all notification settings
  app.get(
    '/api/admin/notifications/settings',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const allSettings = await storage.getAllSettings();

        // Filter notification-related settings
        const notificationSettings = allSettings.filter((s) => s.key.startsWith('notif_'));

        // Return as key-value object for easier frontend consumption
        const settingsObj = notificationSettings.reduce(
          (acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
          },
          {} as Record<string, string>,
        );

        // Ensure all required settings exist with defaults
        const defaults = {
          notif_low_data_75: settingsObj.notif_low_data_75 || 'true',
          notif_low_data_90: settingsObj.notif_low_data_90 || 'true',
          notif_expiring_3days: settingsObj.notif_expiring_3days || 'true',
          notif_expiring_1day: settingsObj.notif_expiring_1day || 'true',
          notif_webhook_url:
            settingsObj.notif_webhook_url ||
            `https://${process.env.BASE_URL || 'localhost:5000'}/api/webhooks/airalo/low-data`,
          notif_opted_in: settingsObj.notif_opted_in || 'false',
        };

        res.json({ settings: defaults });
      } catch (error: any) {
        console.error('Error fetching notification settings:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Update notification settings
  app.put(
    '/api/admin/notifications/settings',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
          return res.status(400).json({ success: false, message: 'Settings object is required' });
        }

        // Validate and update each setting
        const validKeys = [
          'notif_low_data_75',
          'notif_low_data_90',
          'notif_expiring_3days',
          'notif_expiring_1day',
          'notif_webhook_url',
          'notif_opted_in',
        ];

        for (const [key, value] of Object.entries(settings)) {
          if (!validKeys.includes(key)) {
            return res.status(400).json({ success: false, message: `Invalid setting key: ${key}` });
          }

          await storage.setSetting({
            key,
            value: String(value),
            category: 'notifications',
          });
        }

        res.json({ success: true, message: 'Notification settings updated successfully' });
      } catch (error: any) {
        console.error('Error updating notification settings:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Opt-in to Airalo low data notifications
  app.post('/api/admin/notifications/opt-in', requireAdmin, async (req: Request, res: Response) => {
    try {
      const webhookUrl = `https://${process.env.BASE_URL || 'localhost:5000'}/api/webhooks/airalo/low-data`;

      const success = await airaloNotificationService.optInLowData(webhookUrl);

      if (success) {
        // Update settings to reflect opt-in status
        await storage.setSetting({
          key: 'notif_opted_in',
          value: 'true',
          category: 'notifications',
        });
        await storage.setSetting({
          key: 'notif_webhook_url',
          value: webhookUrl,
          category: 'notifications',
        });

        res.json({
          message: 'Successfully opted-in to Airalo low data notifications',
          webhookUrl,
        });
      } else {
        res.status(500).json({ success: false, message: 'Failed to opt-in to notifications' });
      }
    } catch (error: any) {
      console.error('Error opting-in to notifications:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Opt-out from Airalo low data notifications
  app.post(
    '/api/admin/notifications/opt-out',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const success = await airaloNotificationService.optOutLowData();

        if (success) {
          // Update settings to reflect opt-out status
          await storage.setSetting({
            key: 'notif_opted_in',
            value: 'false',
            category: 'notifications',
          });

          res.json({
            success: true,
            message: 'Successfully opted-out from Airalo low data notifications',
          });
        } else {
          res.status(500).json({ success: false, message: 'Failed to opt-out from notifications' });
        }
      } catch (error: any) {
        console.error('Error opting-out from notifications:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Get Airalo notification status
  app.get('/api/admin/notifications/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = await airaloNotificationService.getLowDataStatus();

      res.json({ status });
    } catch (error: any) {
      console.error('Error fetching notification status:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Test webhook (trigger simulator)
  app.post(
    '/api/admin/notifications/test-webhook',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const success = await airaloNotificationService.testWebhook();

        if (success) {
          res.json({
            message: 'Test webhook triggered successfully. Check your webhook endpoint logs.',
          });
        } else {
          res.status(500).json({ success: false, message: 'Failed to trigger test webhook' });
        }
      } catch (error: any) {
        console.error('Error triggering test webhook:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Get notification history with pagination (combines Airalo webhooks and custom notifications)
  app.get('/api/admin/notifications/history', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { source, type, iccid, processed, emailSent, limit = '50', page = '1' } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ success: false, message: 'Invalid page number' });
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({ success: false, message: 'Limit must be between 1 and 100' });
      }

      let allNotifications: any[] = [];

      // Fetch Airalo webhooks if source allows
      if (!source || source === 'all' || source === 'airalo') {
        const airaloFilters: any = { limit: limitNum * 2 };

        if (type && type !== 'custom') airaloFilters.type = type as string;
        if (iccid) airaloFilters.iccid = iccid as string;
        if (processed !== undefined) airaloFilters.processed = processed === 'true';

        const airaloNotifs = await storage.getAiraloNotifications(airaloFilters);

        // Transform to unified format
        allNotifications.push(
          ...airaloNotifs.map((n) => ({
            id: n.id,
            source: 'airalo' as const,
            type: n.type,
            iccid: n.iccid || '',
            processed: n.processed,
            emailSent: n.emailSent || false,
            error: n.errorMessage,
            webhookPayload: n.webhookPayload,
            createdAt: n.createdAt,
          })),
        );
      }

      // Fetch custom notifications if source allows
      if (!source || source === 'all' || source === 'custom') {
        if (type === 'custom' || !type || type === 'all') {
          const customNotifs = await storage.getCustomNotifications({ limit: limitNum * 2 });

          // Transform to unified format
          allNotifications.push(
            ...customNotifs.map((n) => ({
              id: n.id,
              source: 'custom' as const,
              type: 'custom',
              iccid:
                n.recipientType === 'single' ? `Single: ${n.recipientUserId}` : 'All Customers',
              processed: n.status === 'completed',
              emailSent: (n.emailsSent || 0) > 0,
              error: n.status === 'failed' ? 'Failed to send notification' : null,
              webhookPayload: {
                subject: n.subject,
                message: n.message,
                recipientType: n.recipientType,
                emailsSent: n.emailsSent,
                emailsFailed: n.emailsFailed,
              },
              createdAt: n.createdAt,
            })),
          );
        }
      }

      // Apply additional filters
      if (emailSent !== undefined) {
        const emailSentBool = emailSent === 'true';
        allNotifications = allNotifications.filter((n) => n.emailSent === emailSentBool);
      }

      // Sort by date descending
      allNotifications.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Paginate
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedNotifications = allNotifications.slice(startIndex, endIndex);

      res.json({
        notifications: paginatedNotifications,
        total: allNotifications.length,
        page: pageNum,
        limit: limitNum,
      });
    } catch (error: any) {
      console.error('Error fetching notification history:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Custom Notification endpoints
  app.post(
    '/api/admin/notifications/send-custom',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const {
          subject,
          message,
          recipientType,
          recipientUserId,
          sendEmail: shouldSendEmail = true,
          sendInApp = true,
        } = req.body;

        if (!subject || !message || !recipientType) {
          return res
            .status(400)
            .json({ success: false, message: 'Subject, message, and recipientType are required' });
        }

        if (recipientType !== 'all' && recipientType !== 'single') {
          return res
            .status(400)
            .json({ success: false, message: "recipientType must be 'all' or 'single'" });
        }

        if (recipientType === 'single' && !recipientUserId) {
          return res.status(400).json({
            success: false,
            message: "recipientUserId is required when recipientType is 'single'",
          });
        }

        if (!shouldSendEmail && !sendInApp) {
          return res.status(400).json({
            success: false,
            message: 'At least one delivery method (email or in-app) must be selected',
          });
        }

        const adminId = req.session.adminId!;

        const notification = await storage.createCustomNotification({
          subject,
          message,
          recipientType,
          recipientUserId: recipientType === 'single' ? recipientUserId : undefined,
          sentBy: adminId,
          status: 'sending',
        });

        let emailsSent = 0;
        let emailsFailed = 0;
        let inAppSent = 0;

        try {
          if (recipientType === 'single') {
            const user = await storage.getUser(recipientUserId);
            if (!user) {
              await storage.updateCustomNotification(notification.id, {
                status: 'failed',
                emailsFailed: 1,
              });
              return res.status(404).json({ success: false, message: 'User not found' });
            }

            // Send email if enabled
            if (shouldSendEmail) {
              const emailContent = await generateCustomNotificationEmail(
                subject,
                message,
                user.name || user.email,
              );
              try {
                await sendEmail({
                  to: user.email,
                  subject: emailContent.subject,
                  html: emailContent.html,
                });
                emailsSent = 1;
              } catch (error) {
                console.error('Failed to send email to user:', user.email, error);
                emailsFailed = 1;
              }
            }

            // Send in-app notification if enabled
            if (sendInApp) {
              await storage.createNotification({
                userId: user.id,
                type: 'custom',
                title: subject,
                message,
                read: false,
              });
              inAppSent = 1;
              console.log(`✅ In-app notification created for user ${user.email}`);
            }
          } else {
            const users = await storage.getAllUserEmails();

            const promises = users.map(async (user) => {
              let emailSuccess = false;
              let inAppSuccess = false;

              // Send email if enabled
              if (shouldSendEmail) {
                const emailContent = await generateCustomNotificationEmail(
                  subject,
                  message,
                  user.name || user.email,
                );
                try {
                  await sendEmail({
                    to: user.email,
                    subject: emailContent.subject,
                    html: emailContent.html,
                  });
                  emailSuccess = true;
                } catch (error) {
                  console.error('Failed to send email to user:', user.email, error);
                }
              }

              // Send in-app notification if enabled
              if (sendInApp) {
                try {
                  await storage.createNotification({
                    userId: user.id,
                    type: 'custom',
                    title: subject,
                    message,
                    read: false,
                  });
                  inAppSuccess = true;
                } catch (error) {
                  console.error(
                    'Failed to create in-app notification for user:',
                    user.email,
                    error,
                  );
                }
              }

              return { emailSuccess, inAppSuccess };
            });

            const results = await Promise.all(promises);
            emailsSent = results.filter((r) => r.emailSuccess).length;
            emailsFailed = shouldSendEmail ? results.filter((r) => !r.emailSuccess).length : 0;
            inAppSent = results.filter((r) => r.inAppSuccess).length;

            console.log(`✅ Created ${inAppSent} in-app notifications for all users`);
          }

          await storage.updateCustomNotification(notification.id, {
            status: emailsFailed > 0 && emailsSent === 0 ? 'failed' : 'completed',
            emailsSent,
            emailsFailed,
          });

          res.json({
            message: 'Notification sent',
            emailsSent,
            emailsFailed,
            inAppSent,
          });
        } catch (error: any) {
          await storage.updateCustomNotification(notification.id, {
            status: 'failed',
            emailsFailed:
              recipientType === 'single' ? 1 : (await storage.getAllUserEmails()).length,
          });
          throw error;
        }
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  app.get(
    '/api/admin/notifications/custom-history',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const notifications = await storage.getCustomNotifications(limit);
        ApiResponse.success(res, 'Notifications retrieved successfully', notifications);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  app.get('/api/admin/notifications/stats', requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      /* ================================
           USER NOTIFICATION STATS
        ================================= */

      const [notificationStats] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          read: sql<number>`SUM(CASE WHEN ${notifications.read} = true THEN 1 ELSE 0 END)`,
          unread: sql<number>`SUM(CASE WHEN ${notifications.read} = false THEN 1 ELSE 0 END)`,
        })
        .from(notifications);

      const notificationByType = await db
        .select({
          type: notifications.type,
          count: sql<number>`COUNT(*)`,
        })
        .from(notifications)
        .groupBy(notifications.type);

      /* ================================
           CUSTOM NOTIFICATION STATS
        ================================= */

      const [customStats] = await db
        .select({
          totalCampaigns: sql<number>`COUNT(*)`,
          totalEmailsSent: sql<number>`COALESCE(SUM(${customNotifications.emailsSent}), 0)`,
          totalEmailsFailed: sql<number>`COALESCE(SUM(${customNotifications.emailsFailed}), 0)`,
        })
        .from(customNotifications);

      const customStatusBreakdown = await db
        .select({
          status: customNotifications.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(customNotifications)
        .groupBy(customNotifications.status);

      const recentCustomNotifications = await db
        .select()
        .from(customNotifications)
        .orderBy(desc(customNotifications.createdAt))
        .limit(limit);

      /* ================================
           RESPONSE
        ================================= */

      ApiResponse.success(res, 'Notification statistics retrieved', {
        notifications: {
          ...notificationStats,
          byType: notificationByType,
        },
        customNotifications: {
          ...customStats,
          byStatus: customStatusBreakdown,
          recent: recentCustomNotifications,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  // Email Templates Management
  app.get('/api/admin/email-templates', requireAdmin, async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllEmailTemplates();
      ApiResponse.success(res, 'Templates retrieved successfully', templates);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get(
    '/api/admin/email-templates/:eventType',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const template = await storage.getEmailTemplateByType(req.params.eventType);
        if (!template) {
          return res.status(404).json({ success: false, message: 'Template not found' });
        }
        ApiResponse.success(res, 'Template retrieved successfully', template);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  app.post('/api/admin/email-templates', requireAdmin, async (req: Request, res: Response) => {
    try {
      const validated = insertEmailTemplateSchema.parse(req.body);
      const template = await storage.createEmailTemplate(validated);
      res.status(201).json(template);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, message: 'Validation error', errors: error.errors });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put('/api/admin/email-templates/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const validated = insertEmailTemplateSchema.partial().parse(req.body);
      const template = await storage.updateEmailTemplate(req.params.id, validated);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      ApiResponse.success(res, 'Template retrieved successfully', template);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, message: 'Validation error', errors: error.errors });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete(
    '/api/admin/email-templates/:id',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        await storage.deleteEmailTemplate(req.params.id);
        res.status(204).send();
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // ==================== ADMIN - REFERRAL MANAGEMENT ====================

  // Get referral settings
  app.get('/api/admin/referrals/settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const settings = await db.select().from(referralSettings).limit(1);

      if (settings.length === 0) {
        const defaultSettings = await db.insert(referralSettings).values({}).returning();
        return res.json(defaultSettings[0]);
      }

      res.json(settings[0]);
    } catch (error: any) {
      console.error('Error getting referral settings:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Update referral settings
  app.put('/api/admin/referrals/settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const validated = insertReferralSettingsSchema.partial().parse(req.body);

      const existing = await db.select().from(referralSettings).limit(1);

      let updated;
      if (existing.length === 0) {
        updated = await db.insert(referralSettings).values(validated).returning();
      } else {
        updated = await db
          .update(referralSettings)
          .set({ ...validated, updatedAt: new Date() })
          .where(eq(referralSettings.id, existing[0].id))
          .returning();
      }

      res.json(updated[0]);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, message: 'Validation error', errors: error.errors });
      }
      console.error('Error updating referral settings:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get all referrals (admin view)
  app.get('/api/admin/referrals', requireAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      const statusFilter = req.query.status as string;
      const search = req.query.search as string;

      const conditions: any[] = [];

      if (statusFilter && statusFilter !== 'all') {
        conditions.push(eq(referrals.status, statusFilter));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const allReferrals = await db
        .select({
          id: referrals.id,
          referralCode: referrals.referralCode,
          status: referrals.status,
          rewardAmount: referrals.rewardAmount,
          rewardPaid: referrals.rewardPaid,
          completedAt: referrals.completedAt,
          createdAt: referrals.createdAt,
          referrerEmail: sql<string>`referrer.email`.as('referrer_email'),
          referrerName: sql<string>`referrer.name`.as('referrer_name'),
          referredEmail: sql<string>`referred.email`.as('referred_email'),
          referredName: sql<string>`referred.name`.as('referred_name'),
        })
        .from(referrals)
        .leftJoin(sql`${users} AS referrer`, sql`referrer.id = ${referrals.referrerId}`)
        .leftJoin(sql`${users} AS referred`, sql`referred.id = ${referrals.referredId}`)
        .where(whereClause)
        .orderBy(desc(referrals.createdAt))
        .limit(limit)
        .offset(offset);

      const totalCountResult = await db
        .select({ count: count() })
        .from(referrals)
        .where(whereClause);
      const totalCount = totalCountResult[0]?.count || 0;

      const pendingCount = await db
        .select({ count: count() })
        .from(referrals)
        .where(eq(referrals.status, 'pending'));
      const completedCount = await db
        .select({ count: count() })
        .from(referrals)
        .where(eq(referrals.status, 'completed'));

      const totalRewardsResult = await db
        .select({
          total: sql<string>`COALESCE(SUM(${referrals.rewardAmount}), 0)`,
        })
        .from(referrals)
        .where(and(eq(referrals.status, 'completed'), eq(referrals.rewardPaid, true)));

      const pendingPayoutsResult = await db
        .select({
          total: sql<string>`COALESCE(SUM(${referrals.rewardAmount}), 0)`,
        })
        .from(referrals)
        .where(and(eq(referrals.status, 'completed'), eq(referrals.rewardPaid, false)));

      res.json({
        referrals: allReferrals,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        statistics: {
          totalReferrals: totalCount,
          pending: pendingCount[0]?.count || 0,
          completed: completedCount[0]?.count || 0,
          totalRewards: parseFloat(totalRewardsResult[0]?.total || '0'),
          pendingPayouts: parseFloat(pendingPayoutsResult[0]?.total || '0'),
        },
      });
    } catch (error: any) {
      console.error('Error getting admin referrals:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Mark referral as paid
  app.post(
    '/api/admin/referrals/:id/mark-paid',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const updated = await db
          .update(referrals)
          .set({ rewardPaid: true, updatedAt: new Date() })
          .where(eq(referrals.id, req.params.id))
          .returning();

        if (updated.length === 0) {
          return res.status(404).json({ success: false, message: 'Referral not found' });
        }

        res.json({ success: true, message: 'Marked as paid', data: { referral: updated[0] } });
      } catch (error: any) {
        console.error('Error marking referral as paid:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Get referral analytics
  app.get('/api/admin/referrals/analytics', requireAdmin, async (req: Request, res: Response) => {
    try {
      const totalReferralsResult = await db.select({ count: count() }).from(referrals);
      const totalReferrals = totalReferralsResult[0]?.count || 0;

      const completedReferralsResult = await db
        .select({ count: count() })
        .from(referrals)
        .where(eq(referrals.status, 'completed'));
      const completedReferrals = completedReferralsResult[0]?.count || 0;

      const conversionRate = totalReferrals > 0 ? (completedReferrals / totalReferrals) * 100 : 0;

      const topReferrers = await db
        .select({
          userId: referralProgram.userId,
          userEmail: users.email,
          userName: users.name,
          referralCode: referralProgram.referralCode,
          totalReferrals: referralProgram.totalReferrals,
          totalEarnings: referralProgram.totalEarnings,
        })
        .from(referralProgram)
        .leftJoin(users, eq(referralProgram.userId, users.id))
        .orderBy(desc(referralProgram.totalReferrals))
        .limit(10);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const monthlyGrowth = await db
        .select({
          month: sql<string>`TO_CHAR(${referrals.createdAt}, 'YYYY-MM')`,
          count: count(),
        })
        .from(referrals)
        .where(gte(referrals.createdAt, sixMonthsAgo))
        .groupBy(sql`TO_CHAR(${referrals.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${referrals.createdAt}, 'YYYY-MM')`);

      const statusDistribution = await db
        .select({
          status: referrals.status,
          count: count(),
        })
        .from(referrals)
        .groupBy(referrals.status);

      const avgRewardResult = await db
        .select({
          avg: sql<string>`COALESCE(AVG(${referrals.rewardAmount}), 0)`,
        })
        .from(referrals)
        .where(eq(referrals.status, 'completed'));

      res.json({
        totalReferrals,
        completedReferrals,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        topReferrers,
        monthlyGrowth,
        statusDistribution,
        averageReward: parseFloat(avgRewardResult[0]?.avg || '0'),
      });
    } catch (error: any) {
      console.error('Error getting referral analytics:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== BLOG ====================

  // Public blog endpoints
  app.get('/api/blog', async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'public, max-age=300');
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const offset = (page - 1) * limit;

      let query = db.select().from(blogPosts).where(eq(blogPosts.published, true));

      if (search) {
        query = query.where(
          or(ilike(blogPosts.title, `%${search}%`), ilike(blogPosts.excerpt, `%${search}%`)),
        ) as any;
      }

      const posts = await query.orderBy(desc(blogPosts.publishedAt)).limit(limit).offset(offset);

      let countQuery = db.select({ count: count() }).from(blogPosts).where(eq(blogPosts.published, true));
      if (search) {
        countQuery = countQuery.where(
          or(ilike(blogPosts.title, `%${search}%`), ilike(blogPosts.excerpt, `%${search}%`)),
        ) as any;
      }

      const totalResult = await countQuery;
      const total = totalResult[0]?.count || 0;

      res.json({
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/api/blog/:slug', async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'public, max-age=300');
      const post = await db.query.blogPosts.findFirst({
        where: and(eq(blogPosts.slug, req.params.slug), eq(blogPosts.published, true)),
        with: {
          author: true,
        },
      });

      if (!post) {
        return res.status(404).json({ success: false, message: 'Blog post not found' });
      }

      ApiResponse.success(res, 'Post operation successful', post);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin blog endpoints
  app.get('/api/admin/blog', requireAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const posts = await db.query.blogPosts.findMany({
        orderBy: [desc(blogPosts.createdAt)],
        limit,
        offset,
        with: {
          author: true,
        },
      });

      const totalResult = await db.select({ count: count() }).from(blogPosts);
      const total = totalResult[0]?.count || 0;

      res.json({
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // app.post("/api/admin/blog", requireAdmin,createMultiUploader("blog", [
  //   { name: "featuredImage", maxCount: 1 },
  // ]), async (req: Request, res: Response) => {
  //   try {
  //     const data = req.body;

  //     // Files
  //     const files: any = req.files;

  //     const featuredImage = files?.featuredImage
  //       ? `/uploads/blog/${files.featuredImage[0].filename}`
  //       : null;

  //     const [post] = await db.insert(blogPosts).values({
  //       title: data.title,
  //       slug: data.slug,
  //       excerpt: data.excerpt,
  //       content: data.content,
  //       featuredImage,
  //       authorId: req.session.adminId,
  //       published: data.published || false,
  //       publishedAt: data.published ? new Date() : null,
  //       metaDescription: data.metaDescription || null,
  //       metaKeywords: data.metaKeywords || [],
  //     }).returning();

  //     ApiResponse.success(res, "Post operation successful", post);
  //   } catch (error: any) {
  //     res.status(500).json({ success: false, message: error.message });
  //   }
  // });

  app.post(
    '/api/admin/blog',
    requireAdmin,
    createMultiUploader('blog', [{ name: 'featuredImage', maxCount: 1 }]),
    async (req: Request, res: Response) => {
      try {
        const data = req.body;
        const files: any = req.files;

        const featuredImage = files?.featuredImage
          ? `/uploads/blog/${files.featuredImage[0].filename}`
          : null;

        const metaKeywords =
          typeof data.metaKeywords === 'string'
            ? data.metaKeywords
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean)
            : [];

        const [post] = await db
          .insert(blogPosts)
          .values({
            title: data.title,
            slug: data.slug,
            excerpt: data.excerpt,
            content: data.content,
            featuredImage,
            authorId: req.session.adminId,
            published: data.published === 'true',
            publishedAt: data.published === 'true' ? new Date() : null,
            metaDescription: data.metaDescription || null,
            metaKeywords,
          })
          .returning();

        ApiResponse.success(res, 'Post operation successful', post);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  app.put(
    '/api/admin/blog/:id',
    requireAdmin,
    createMultiUploader('blog', [{ name: 'featuredImage', maxCount: 1 }]),
    async (req: Request, res: Response) => {
      try {
        const data = req.body;
        const files: any = req.files;

        const featuredImage = files?.featuredImage
          ? `/uploads/blog/${files.featuredImage[0].filename}`
          : null;

        const metaKeywords =
          typeof data.metaKeywords === 'string'
            ? data.metaKeywords
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean)
            : [];
        const updateData: any = {
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt,
          content: data.content,
          published: data.published,
          publishedAt: data.published && !data.publishedAt ? new Date() : data.publishedAt,
          metaDescription: data.metaDescription || null,
          metaKeywords: metaKeywords || [],
          updatedAt: new Date(),
        };

        if (featuredImage != null) {
          updateData.featuredImage = featuredImage;
        }
        console.log('blig update api');
        console.log(data);
        const [updated] = await db
          .update(blogPosts)
          .set(updateData)
          .where(eq(blogPosts.id, req.params.id))
          .returning();

        if (!updated) {
          return res.status(404).json({ success: false, message: 'Blog post not found' });
        }

        ApiResponse.success(res, 'Updated successfully', updated);
      } catch (error: any) {
        console.log(`catch :- ${error}`);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  app.delete('/api/admin/blog/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const [deleted] = await db
        .delete(blogPosts)
        .where(eq(blogPosts.id, req.params.id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Blog post not found' });
      }

      res.json({ success: true, message: 'Blog post deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/admin/blog/:id/publish', requireAdmin, async (req: Request, res: Response) => {
    try {
      const [updated] = await db
        .update(blogPosts)
        .set({
          published: true,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(blogPosts.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Blog post not found' });
      }

      ApiResponse.success(res, 'Updated successfully', updated);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ENTERPRISE PORTAL ROUTES ====================

  // Apply for enterprise account
  app.post('/api/enterprise/apply', requireAuth, async (req: Request, res: Response) => {
    try {
      const { enterpriseAccounts, insertEnterpriseAccountSchema } = await import('@shared/schema');

      const data = insertEnterpriseAccountSchema.parse({
        ...req.body,
        userId: req.session.userId,
        status: 'pending',
      });

      const [account] = await db.insert(enterpriseAccounts).values(data).returning();

      ApiResponse.success(res, 'Account operation successful', account);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // Get user's enterprise account
  app.get('/api/enterprise/my-account', requireAuth, async (req: Request, res: Response) => {
    try {
      const { enterpriseAccounts } = await import('@shared/schema');

      const account = await db.query.enterpriseAccounts.findFirst({
        where: eq(enterpriseAccounts.userId, req.session.userId!),
      });

      if (!account) {
        return res.status(404).json({ success: false, message: 'No enterprise account found' });
      }

      ApiResponse.success(res, 'Account operation successful', account);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get enterprise quotes
  app.get('/api/enterprise/quotes', requireAuth, async (req: Request, res: Response) => {
    try {
      const { bulkQuotes, enterpriseAccounts } = await import('@shared/schema');

      const account = await db.query.enterpriseAccounts.findFirst({
        where: eq(enterpriseAccounts.userId, req.session.userId!),
      });

      if (!account) {
        return res.status(404).json({ success: false, message: 'No enterprise account found' });
      }

      const quotes = await db.query.bulkQuotes.findMany({
        where: eq(bulkQuotes.enterpriseAccountId, account.id),
        with: {
          package: true,
        },
        orderBy: (bulkQuotes, { desc }) => [desc(bulkQuotes.createdAt)],
      });

      ApiResponse.success(res, 'Quotes retrieved successfully', quotes);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Accept quote and convert to order
  app.post(
    '/api/enterprise/quotes/:id/accept',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { bulkQuotes, bulkOrders, enterpriseAccounts, insertBulkOrderSchema } =
          await import('@shared/schema');

        const account = await db.query.enterpriseAccounts.findFirst({
          where: eq(enterpriseAccounts.userId, req.session.userId!),
        });

        if (!account || account.status !== 'approved') {
          return res
            .status(403)
            .json({ success: false, message: 'Enterprise account not approved' });
        }

        const quote = await db.query.bulkQuotes.findFirst({
          where: and(
            eq(bulkQuotes.id, req.params.id),
            eq(bulkQuotes.enterpriseAccountId, account.id),
          ),
        });

        if (!quote) {
          return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        if (quote.status !== 'approved') {
          return res.status(400).json({ success: false, message: 'Quote not approved' });
        }

        if (new Date() > new Date(quote.validUntil)) {
          return res.status(400).json({ success: false, message: 'Quote has expired' });
        }

        const orderData = insertBulkOrderSchema.parse({
          enterpriseAccountId: account.id,
          quoteId: quote.id,
          totalAmount: quote.totalPrice,
          status: 'pending',
          paymentMethod: req.body.paymentMethod || 'invoice',
          paymentStatus: 'pending',
        });

        const [order] = await db.insert(bulkOrders).values(orderData).returning();

        await db
          .update(bulkQuotes)
          .set({ status: 'converted', updatedAt: new Date() })
          .where(eq(bulkQuotes.id, quote.id));

        ApiResponse.success(res, 'Order retrieved successfully', order);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Get enterprise orders
  app.get('/api/enterprise/orders', requireAuth, async (req: Request, res: Response) => {
    try {
      const { bulkOrders, enterpriseAccounts } = await import('@shared/schema');

      const account = await db.query.enterpriseAccounts.findFirst({
        where: eq(enterpriseAccounts.userId, req.session.userId!),
      });

      if (!account) {
        return res.status(404).json({ success: false, message: 'No enterprise account found' });
      }

      const enterpriseOrders = await db.query.bulkOrders.findMany({
        where: eq(bulkOrders.enterpriseAccountId, account.id),
        with: {
          quote: {
            with: {
              package: true,
            },
          },
        },
        orderBy: (bulkOrders, { desc }) => [desc(bulkOrders.createdAt)],
      });

      ApiResponse.success(res, 'Enterprise orders retrieved successfully', enterpriseOrders);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ADMIN ENTERPRISE ROUTES ====================

  // List all enterprise accounts
  app.get('/api/admin/enterprise/accounts', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { enterpriseAccounts } = await import('@shared/schema');

      const accounts = await db.query.enterpriseAccounts.findMany({
        with: {
          user: true,
          approvedByAdmin: true,
        },
        orderBy: (enterpriseAccounts, { desc }) => [desc(enterpriseAccounts.createdAt)],
      });

      ApiResponse.success(res, 'Accounts retrieved successfully', accounts);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Create enterprise account
  app.post('/api/admin/enterprise/accounts', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { enterpriseAccounts, insertEnterpriseAccountSchema } = await import('@shared/schema');

      const data = insertEnterpriseAccountSchema.parse({
        ...req.body,
        approvedBy: req.admin?.id,
        approvedAt: new Date(),
      });

      const [account] = await db.insert(enterpriseAccounts).values(data).returning();

      res.status(201).json(account);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Approve enterprise account
  app.post(
    '/api/admin/enterprise/accounts/:id/approve',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { enterpriseAccounts } = await import('@shared/schema');

        const [updated] = await db
          .update(enterpriseAccounts)
          .set({
            status: 'approved',
            approvedBy: req.session.adminId,
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(enterpriseAccounts.id, req.params.id))
          .returning();

        if (!updated) {
          return res.status(404).json({ success: false, message: 'Enterprise account not found' });
        }

        ApiResponse.success(res, 'Updated successfully', updated);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Update enterprise account (credit limit, discount)
  app.put(
    '/api/admin/enterprise/accounts/:id',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { enterpriseAccounts } = await import('@shared/schema');

        const { creditLimit, discountPercent, status } = req.body;

        const [updated] = await db
          .update(enterpriseAccounts)
          .set({
            creditLimit,
            discountPercent,
            status,
            updatedAt: new Date(),
          })
          .where(eq(enterpriseAccounts.id, req.params.id))
          .returning();

        if (!updated) {
          return res.status(404).json({ success: false, message: 'Enterprise account not found' });
        }

        ApiResponse.success(res, 'Updated successfully', updated);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // List all bulk quotes
  app.get('/api/admin/enterprise/quotes', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { bulkQuotes } = await import('@shared/schema');

      const quotes = await db.query.bulkQuotes.findMany({
        with: {
          enterpriseAccount: true,
          package: true,
          createdByAdmin: true,
        },
        orderBy: (bulkQuotes, { desc }) => [desc(bulkQuotes.createdAt)],
      });

      ApiResponse.success(res, 'Quotes retrieved successfully', quotes);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Create bulk quote
  app.post('/api/admin/enterprise/quotes', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { bulkQuotes, insertBulkQuoteSchema } = await import('@shared/schema');

      // Convert validUntil from ISO string to Date object before validation
      const requestData = {
        ...req.body,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
        createdBy: req.session.adminId,
      };

      const data = insertBulkQuoteSchema.parse(requestData);

      const [quote] = await db.insert(bulkQuotes).values(data).returning();

      ApiResponse.success(res, 'Quote operation successful', quote);
    } catch (error: any) {
      console.error('Create quote error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // Update bulk quote
  app.put('/api/admin/enterprise/quotes/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { bulkQuotes } = await import('@shared/schema');

      const [updated] = await db
        .update(bulkQuotes)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(bulkQuotes.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Quote not found' });
      }

      ApiResponse.success(res, 'Updated successfully', updated);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Delete bulk quote
  app.delete(
    '/api/admin/enterprise/quotes/:id',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { bulkQuotes } = await import('@shared/schema');

        const [deleted] = await db
          .delete(bulkQuotes)
          .where(eq(bulkQuotes.id, req.params.id))
          .returning();

        if (!deleted) {
          return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        res.json({ success: true, message: 'Quote deleted' });
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Send quote to customer
  app.post(
    '/api/admin/enterprise/quotes/:id/send',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { bulkQuotes, enterpriseAccounts } = await import('@shared/schema');

        const quote = await db.query.bulkQuotes.findFirst({
          where: eq(bulkQuotes.id, req.params.id),
          with: {
            enterpriseAccount: true,
            package: {
              with: {
                destination: true,
              },
            },
          },
        });

        if (!quote || !quote.enterpriseAccount) {
          return res
            .status(404)
            .json({ success: false, message: 'Quote or enterprise account not found' });
        }

        const emailService = await import('./email');
        await emailService.sendEnterpriseQuoteEmail({
          to: quote.enterpriseAccount.email,
          companyName: quote.enterpriseAccount.companyName,
          quoteId: quote.id,
          packageName: quote.package?.title || 'Package',
          destination: quote.package?.destination?.name || '',
          quantity: quote.quantity,
          unitPrice: quote.unitPrice,
          discountPercent: quote.discountPercent || '0',
          totalPrice: quote.totalPrice,
          validUntil: quote.validUntil,
          notes: quote.notes,
        });

        const [updated] = await db
          .update(bulkQuotes)
          .set({
            status: 'sent',
            updatedAt: new Date(),
          })
          .where(eq(bulkQuotes.id, req.params.id))
          .returning();

        ApiResponse.success(res, 'Updated successfully', updated);
      } catch (error: any) {
        console.error('Send quote error:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // List all bulk orders
  app.get('/api/admin/enterprise/orders', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { bulkOrders } = await import('@shared/schema');

      const enterpriseOrders = await db.query.bulkOrders.findMany({
        with: {
          enterpriseAccount: true,
          quote: {
            with: {
              package: true,
            },
          },
        },
        orderBy: (bulkOrders, { desc }) => [desc(bulkOrders.createdAt)],
      });

      ApiResponse.success(res, 'Enterprise orders retrieved successfully', enterpriseOrders);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Create bulk order from quote
  app.post('/api/admin/enterprise/orders', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { bulkOrders, bulkQuotes, insertBulkOrderSchema } = await import('@shared/schema');
      const { quoteId, paymentMethod, notes } = req.body;

      // Get the quote
      const quote = await db.query.bulkQuotes.findFirst({
        where: eq(bulkQuotes.id, quoteId),
      });

      if (!quote) {
        return res.status(404).json({ success: false, message: 'Quote not found' });
      }

      if (quote.status !== 'approved') {
        return res
          .status(400)
          .json({ success: false, message: 'Quote must be approved before creating order' });
      }

      // Create bulk order
      const orderData = insertBulkOrderSchema.parse({
        enterpriseAccountId: quote.enterpriseAccountId,
        quoteId: quote.id,
        totalAmount: quote.totalPrice,
        paymentMethod: paymentMethod || 'credit',
        status: 'pending',
        paymentStatus: 'pending',
        notes,
      });

      const [order] = await db.insert(bulkOrders).values(orderData).returning();

      res.status(201).json(order);
    } catch (error: any) {
      console.error('Create bulk order error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get bulk order details with associated individual eSIM orders
  app.get(
    '/api/admin/enterprise/orders/:id/details',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { bulkOrders, bulkQuotes, orders: ordersTable } = await import('@shared/schema');
        const { id } = req.params;

        const bulkOrder = await db.query.bulkOrders.findFirst({
          where: eq(bulkOrders.id, id),
          with: {
            enterpriseAccount: true,
            quote: {
              with: {
                package: true,
              },
            },
          },
        });

        if (!bulkOrder) {
          return res.status(404).json({ success: false, message: 'Bulk order not found' });
        }

        // Get all individual eSIM orders linked to this bulk order
        const individualOrders = await db.query.orders.findMany({
          where: eq(ordersTable.bulkOrderId, id),
          orderBy: [ordersTable.createdAt],
        });

        return res.json({
          ...bulkOrder,
          individualOrders,
          individualOrderCount: individualOrders.length,
          completedCount: individualOrders.filter((o) => o.status === 'completed').length,
          processingCount: individualOrders.filter((o) => o.status === 'processing').length,
          failedCount: individualOrders.filter((o) => o.status === 'failed').length,
        });
      } catch (error: any) {
        console.error('Get bulk order details error:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Execute bulk order - create individual eSIM orders via provider APIs
  app.post(
    '/api/admin/enterprise/orders/:id/execute',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { bulkOrders, bulkQuotes, orders: ordersTable } = await import('@shared/schema');
        const { id } = req.params;

        // Get the bulk order with quote and package details
        const bulkOrder = await db.query.bulkOrders.findFirst({
          where: eq(bulkOrders.id, id),
          with: {
            quote: {
              with: {
                package: true,
              },
            },
            enterpriseAccount: true,
          },
        });

        if (!bulkOrder) {
          return res.status(404).json({ success: false, message: 'Bulk order not found' });
        }

        if (bulkOrder.status !== 'pending') {
          return res
            .status(400)
            .json({ success: false, message: 'Bulk order has already been executed or cancelled' });
        }

        if (!bulkOrder.quote || !bulkOrder.quote.package) {
          return res.status(400).json({ success: false, message: 'Quote or package not found' });
        }

        const quote = bulkOrder.quote;
        const pkg = quote.package;
        const quantity = quote.quantity;

        if (!pkg) {
          throw new Error('Package details not found in quote');
        }

        // Update bulk order status to processing
        await db
          .update(bulkOrders)
          .set({ status: 'processing', updatedAt: new Date() })
          .where(eq(bulkOrders.id, id));

        try {
          // Route to the correct provider based on package
          const { providerFactory } = await import('./providers/provider-factory');
          const { resolvePackage, getProviderSpecificPackageId } =
            await import('./services/packages/package-resolver');

          // Resolve the full package details
          const fullPackage = await resolvePackage(pkg.id);
          if (!fullPackage) {
            throw new Error('Package not found');
          }

          let orderRecords: any[] = [];

          // For batch orders (quantity > 1), use batch API if available
          if (quantity > 1 && fullPackage.providerId) {
            const providerService = await providerFactory.getServiceById(fullPackage.providerId);
            const providerApiPackageId = await getProviderSpecificPackageId(
              fullPackage.providerPackageTable!,
              fullPackage.providerPackageId!,
            );

            if (!providerApiPackageId) {
              throw new Error('Provider package ID not found');
            }

            // Try batch order first
            try {
              // Use createOrder with batch quantity - provider services handle batch internally
              const batchResponse = await providerService.createOrder({
                packageId: providerApiPackageId,
                quantity: quantity,
              });

              // Create order records for each eSIM in the batch
              const pricePerEsim = parseFloat(quote.unitPrice);
              const wholesalePricePerEsim = parseFloat(
                fullPackage.wholesalePrice || quote.unitPrice,
              );

              // For batch orders, we get a requestId and create pending orders
              // These will be completed via webhook when eSIMs are provisioned
              const requestId = batchResponse.requestId || `BULK_${id}_${Date.now()}`;

              for (let i = 0; i < quantity; i++) {
                // Create order with bulkOrderId link - CRITICAL for enterprise workflow!
                const orderData: any = {
                  userId: bulkOrder.enterpriseAccount?.userId || null,
                  packageId: pkg.id,
                  orderType: 'batch',
                  quantity: 1,
                  status: 'processing',
                  price: pricePerEsim.toString(),
                  wholesalePrice: wholesalePricePerEsim.toString(),
                  airaloPrice: wholesalePricePerEsim.toString(),
                  currency: pkg.currency,
                  dataAmount: pkg.dataAmount,
                  validity: pkg.validity,
                  requestId: requestId,
                  installationSent: false,
                  providerId: fullPackage.providerId,
                };

                const orderRecord = await storage.createOrder(orderData);

                // Link order to bulk order via bulkOrderId
                await db
                  .update(ordersTable)
                  .set({ bulkOrderId: id })
                  .where(eq(ordersTable.id, orderRecord.id));

                orderRecords.push({ ...orderRecord, bulkOrderId: id });
              }

              console.log(
                `✅ Created ${orderRecords.length} batch order records for bulk order ${id}`,
              );
            } catch (batchError) {
              console.log('Batch order not supported, falling back to individual orders');

              // Fall back to individual orders
              for (let i = 0; i < quantity; i++) {
                const providerResponse = await providerService.createOrder({
                  packageId: providerApiPackageId,
                  quantity: 1,
                });

                const pricePerEsim = parseFloat(quote.unitPrice);
                const wholesalePricePerEsim = parseFloat(
                  fullPackage.wholesalePrice || quote.unitPrice,
                );

                const orderData: any = {
                  userId: bulkOrder.enterpriseAccount?.userId || null,
                  packageId: pkg.id,
                  orderType: 'single',
                  quantity: 1,
                  status: providerResponse.status === 'completed' ? 'completed' : 'processing',
                  price: pricePerEsim.toString(),
                  wholesalePrice: wholesalePricePerEsim.toString(),
                  airaloPrice: wholesalePricePerEsim.toString(),
                  currency: pkg.currency,
                  dataAmount: pkg.dataAmount,
                  validity: pkg.validity,
                  installationSent: false,
                  providerId: fullPackage.providerId,
                  // eSIM details if immediately available
                  iccid: providerResponse.iccid,
                  qrCode: providerResponse.qrCode,
                  qrCodeUrl: providerResponse.qrCodeUrl,
                  smdpAddress: providerResponse.smdpAddress,
                  activationCode: providerResponse.activationCode,
                };

                const orderRecord = await storage.createOrder(orderData);

                // Link order to bulk order via bulkOrderId - CRITICAL for enterprise workflow!
                await db
                  .update(ordersTable)
                  .set({ bulkOrderId: id })
                  .where(eq(ordersTable.id, orderRecord.id));

                orderRecords.push({ ...orderRecord, bulkOrderId: id });
              }

              console.log(
                `✅ Created ${orderRecords.length} individual order records for bulk order ${id}`,
              );
            }
          } else {
            // Single order or no provider support for batch
            throw new Error('Bulk order execution requires quantity > 1');
          }

          // Update bulk order status to completed
          await db
            .update(bulkOrders)
            .set({
              status: 'completed',
              paymentStatus: 'completed',
              updatedAt: new Date(),
            })
            .where(eq(bulkOrders.id, id));

          res.json({
            message: 'Bulk order executed successfully',
            orderCount: orderRecords.length,
            orders: orderRecords,
          });
        } catch (executionError: any) {
          console.error('Bulk order execution failed:', executionError);

          // Update bulk order status to failed
          await db
            .update(bulkOrders)
            .set({
              status: 'failed',
              notes: `Execution failed: ${executionError.message}`,
              updatedAt: new Date(),
            })
            .where(eq(bulkOrders.id, id));

          throw executionError;
        }
      } catch (error: any) {
        console.error('Execute bulk order error:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Get enterprise analytics
  app.get('/api/admin/enterprise/analytics', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { bulkOrders, enterpriseAccounts } = await import('@shared/schema');

      const totalAccounts = await db.select({ count: count() }).from(enterpriseAccounts);

      const approvedAccounts = await db
        .select({ count: count() })
        .from(enterpriseAccounts)
        .where(eq(enterpriseAccounts.status, 'approved'));

      const totalRevenue = await db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(${bulkOrders.totalAmount} AS DECIMAL)), 0)`,
        })
        .from(bulkOrders)
        .where(eq(bulkOrders.status, 'completed'));

      const topAccounts = await db
        .select({
          accountId: bulkOrders.enterpriseAccountId,
          companyName: enterpriseAccounts.companyName,
          totalOrders: count(),
          totalSpent: sql<number>`COALESCE(SUM(CAST(${bulkOrders.totalAmount} AS DECIMAL)), 0)`,
        })
        .from(bulkOrders)
        .leftJoin(enterpriseAccounts, eq(bulkOrders.enterpriseAccountId, enterpriseAccounts.id))
        .groupBy(bulkOrders.enterpriseAccountId, enterpriseAccounts.companyName)
        .orderBy(desc(sql`COALESCE(SUM(CAST(${bulkOrders.totalAmount} AS DECIMAL)), 0)`))
        .limit(10);

      res.json({
        totalAccounts: totalAccounts[0]?.count || 0,
        approvedAccounts: approvedAccounts[0]?.count || 0,
        totalRevenue: totalRevenue[0]?.total || 0,
        topAccounts,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ====================ENTERPRISE PORTAL CUSTOMER APIS ====================

  // Middleware to check enterprise portal authentication
  const requireEnterpriseAuth = (req: Request, res: Response, next: Function) => {
    if (!req.session.enterpriseUserId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
  };

  // Enterprise portal registration (invitation-based)
  app.post('/api/enterprise/register', async (req: Request, res: Response) => {
    try {
      const bcrypt = await import('bcrypt');
      const { enterpriseUsers, enterpriseAccounts } = await import('@shared/schema');
      const { email, password, name, invitationCode } = req.body;

      if (!email || !password || !invitationCode) {
        return res
          .status(400)
          .json({ success: false, message: 'Email, password, and invitation code are required' });
      }

      const enterpriseAccount = await db.query.enterpriseAccounts.findFirst({
        where: eq(enterpriseAccounts.email, invitationCode),
      });

      if (!enterpriseAccount || enterpriseAccount.status !== 'approved') {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid invitation code or account not approved' });
      }

      const existingUser = await db.query.enterpriseUsers.findFirst({
        where: eq(enterpriseUsers.email, email),
      });

      if (existingUser) {
        return res.status(400).json({ success: false, message: 'User already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [newUser] = await db
        .insert(enterpriseUsers)
        .values({
          enterpriseAccountId: enterpriseAccount.id,
          email,
          passwordHash,
          name: name || null,
          role: 'owner',
          isActive: true,
        })
        .returning();

      req.session.enterpriseUserId = newUser.id;
      req.session.enterpriseAccountId = enterpriseAccount.id;

      res.json({
        message: 'Registration successful',
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          enterpriseAccountId: newUser.enterpriseAccountId,
        },
      });
    } catch (error: any) {
      console.error('Enterprise registration error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Enterprise portal login
  app.post('/api/enterprise/login', async (req: Request, res: Response) => {
    try {
      const bcrypt = await import('bcrypt');
      const { enterpriseUsers, enterpriseSessions } = await import('@shared/schema');
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }

      const user = await db.query.enterpriseUsers.findFirst({
        where: eq(enterpriseUsers.email, email),
        with: {
          enterpriseAccount: true,
        },
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      await db
        .update(enterpriseUsers)
        .set({ lastLoginAt: new Date() })
        .where(eq(enterpriseUsers.id, user.id));

      const userAgent = req.get('user-agent') || 'Unknown';
      const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown';

      await db.insert(enterpriseSessions).values({
        enterpriseUserId: user.id,
        sessionToken: req.sessionID,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      req.session.enterpriseUserId = user.id;
      req.session.enterpriseAccountId = user.enterpriseAccountId;

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          enterpriseAccountId: user.enterpriseAccountId,
          enterpriseAccount: {
            companyName: user.enterpriseAccount?.companyName,
            status: user.enterpriseAccount?.status,
          },
        },
      });
    } catch (error: any) {
      console.error('Enterprise login error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Enterprise portal logout
  app.post('/api/enterprise/logout', requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const { enterpriseSessions } = await import('@shared/schema');

      await db
        .update(enterpriseSessions)
        .set({ loggedOutAt: new Date() })
        .where(eq(enterpriseSessions.sessionToken, req.sessionID));

      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', error);
        }
      });

      res.json({ success: true, message: 'Logout successful' });
    } catch (error: any) {
      console.error('Enterprise logout error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get current enterprise user
  app.get('/api/enterprise/me', requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const { enterpriseUsers } = await import('@shared/schema');

      const user = await db.query.enterpriseUsers.findFirst({
        where: eq(enterpriseUsers.id, req.session.enterpriseUserId!),
        with: {
          enterpriseAccount: true,
        },
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        enterpriseAccountId: user.enterpriseAccountId,
        enterpriseAccount: {
          companyName: user.enterpriseAccount?.companyName,
          status: user.enterpriseAccount?.status,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // List sent quotes for enterprise customer
  app.get('/api/enterprise/quotes', requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const { bulkQuotes } = await import('@shared/schema');

      const quotes = await db.query.bulkQuotes.findMany({
        where: and(
          eq(bulkQuotes.enterpriseAccountId, req.session.enterpriseAccountId!),
          eq(bulkQuotes.status, 'sent'),
        ),
        with: {
          package: {
            with: {
              destination: true,
            },
          },
        },
        orderBy: (bulkQuotes, { desc }) => [desc(bulkQuotes.createdAt)],
      });

      ApiResponse.success(res, 'Quotes retrieved successfully', quotes);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Accept quote and create order
  app.post(
    '/api/enterprise/quotes/:id/accept',
    requireEnterpriseAuth,
    async (req: Request, res: Response) => {
      try {
        const { bulkQuotes, bulkOrders, insertBulkOrderSchema } = await import('@shared/schema');

        const quote = await db.query.bulkQuotes.findFirst({
          where: and(
            eq(bulkQuotes.id, req.params.id),
            eq(bulkQuotes.enterpriseAccountId, req.session.enterpriseAccountId!),
          ),
        });

        if (!quote) {
          return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        if (quote.status !== 'sent') {
          return res
            .status(400)
            .json({ success: false, message: 'Quote is not available for acceptance' });
        }

        const validUntil = new Date(quote.validUntil);
        if (validUntil < new Date()) {
          return res.status(400).json({ success: false, message: 'Quote has expired' });
        }

        await db
          .update(bulkQuotes)
          .set({ status: 'approved', updatedAt: new Date() })
          .where(eq(bulkQuotes.id, quote.id));

        const [order] = await db
          .insert(bulkOrders)
          .values({
            enterpriseAccountId: quote.enterpriseAccountId,
            quoteId: quote.id,
            totalAmount: quote.totalPrice,
            status: 'pending',
            paymentMethod: 'credit',
          })
          .returning();

        ApiResponse.success(res, 'Order retrieved successfully', order);
      } catch (error: any) {
        console.error('Accept quote error:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // List enterprise orders
  app.get('/api/enterprise/orders', requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const { bulkOrders } = await import('@shared/schema');

      const orders = await db.query.bulkOrders.findMany({
        where: eq(bulkOrders.enterpriseAccountId, req.session.enterpriseAccountId!),
        with: {
          quote: {
            with: {
              package: {
                with: {
                  destination: true,
                },
              },
            },
          },
        },
        orderBy: (bulkOrders, { desc }) => [desc(bulkOrders.createdAt)],
      });

      ApiResponse.success(res, 'Orders retrieved successfully', orders);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get order details with individual eSIMs
  app.get(
    '/api/enterprise/orders/:id/details',
    requireEnterpriseAuth,
    async (req: Request, res: Response) => {
      try {
        const { bulkOrders, orders: ordersTable } = await import('@shared/schema');

        const bulkOrder = await db.query.bulkOrders.findFirst({
          where: and(
            eq(bulkOrders.id, req.params.id),
            eq(bulkOrders.enterpriseAccountId, req.session.enterpriseAccountId!),
          ),
          with: {
            quote: {
              with: {
                package: {
                  with: {
                    destination: true,
                  },
                },
              },
            },
          },
        });

        if (!bulkOrder) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const individualOrders = await db.query.orders.findMany({
          where: eq(ordersTable.bulkOrderId, bulkOrder.id),
        });

        const statusCounts = individualOrders.reduce((acc: any, order: any) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        }, {});

        res.json({
          ...bulkOrder,
          individualOrders,
          individualOrderCount: individualOrders.length,
          completedCount: statusCounts.completed || 0,
          processingCount: statusCounts.processing || 0,
          failedCount: statusCounts.failed || 0,
        });
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Distribute eSIMs to employee emails with transaction-scoped reservation
  app.post(
    '/api/enterprise/orders/:id/distribute',
    requireEnterpriseAuth,
    async (req: Request, res: Response) => {
      try {
        const {
          bulkOrders,
          orders: ordersTable,
          enterpriseOrderAllocations,
        } = await import('@shared/schema');
        const { employeeEmails } = req.body;

        if (!Array.isArray(employeeEmails) || employeeEmails.length === 0) {
          return res.status(400).json({ success: false, message: 'Employee emails are required' });
        }

        const bulkOrder = await db.query.bulkOrders.findFirst({
          where: and(
            eq(bulkOrders.id, req.params.id),
            eq(bulkOrders.enterpriseAccountId, req.session.enterpriseAccountId!),
          ),
        });

        if (!bulkOrder) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }

        let reservedAllocations: any[] = [];

        try {
          await db.transaction(async (tx) => {
            const lockedOrdersResult = await tx.execute(sql`
            SELECT o.* FROM orders o
            WHERE o.bulk_order_id = ${bulkOrder.id}
              AND o.status = 'completed'
              AND o.id NOT IN (
                SELECT order_id FROM enterprise_order_allocations WHERE bulk_order_id = ${bulkOrder.id}
              )
            LIMIT ${employeeEmails.length}
            FOR UPDATE SKIP LOCKED
          `);

            const lockedOrders = lockedOrdersResult.rows;

            if (lockedOrders.length === 0) {
              throw new Error('No completed eSIMs available for distribution');
            }

            if (lockedOrders.length < employeeEmails.length) {
              throw new Error(
                `Only ${lockedOrders.length} unallocated eSIMs available, but ${employeeEmails.length} requested`,
              );
            }

            const allocationsToInsert = employeeEmails.map((email, i) => ({
              bulkOrderId: bulkOrder.id,
              orderId: lockedOrders[i].id as string,
              employeeEmail: email,
              downloadToken: `DL_${lockedOrders[i].id}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
              status: 'pending' as const,
            }));

            const insertedAllocations = await tx
              .insert(enterpriseOrderAllocations)
              .values(allocationsToInsert)
              .onConflictDoNothing()
              .returning();

            if (insertedAllocations.length < allocationsToInsert.length) {
              throw new Error(
                `CONFLICT: Only ${insertedAllocations.length} of ${allocationsToInsert.length} allocations were created due to conflicts`,
              );
            }

            reservedAllocations = insertedAllocations.map((alloc) => {
              const matchingOrder = lockedOrders.find((order: any) => order.id === alloc.orderId);
              return {
                ...alloc,
                order: matchingOrder,
              };
            });
          });
        } catch (txError: any) {
          if (txError.message.includes('unallocated eSIMs available')) {
            return res.status(400).json({ success: false, message: txError.message });
          }
          if (txError.message.includes('CONFLICT:') || txError.code === '23505') {
            return res.status(409).json({
              success: false,
              message: 'Some eSIMs were already allocated. Please refresh and try again.',
            });
          }
          throw txError;
        }

        const distributionResults = [];

        for (const allocation of reservedAllocations) {
          const { employeeEmail, orderId, downloadToken, order } = allocation;

          try {
            await sendEmail({
              to: employeeEmail,
              subject: 'Your eSIM is Ready',
              html: `
              <h2>Your eSIM Has Been Provisioned</h2>
              <p>Your company has provided you with an eSIM for international connectivity.</p>
              <h3>eSIM Details:</h3>
              <ul>
                <li>Data: ${order.data_amount || order.dataAmount}</li>
                <li>Validity: ${order.validity}</li>
                <li>ICCID: ${order.iccid || 'Pending'}</li>
              </ul>
              ${order.qr_code_url || order.qrCodeUrl ? `<p>QR Code: <a href="${order.qr_code_url || order.qrCodeUrl}">Download QR Code</a></p>` : ''}
              ${order.activation_code || order.activationCode ? `<p>Activation Code: ${order.activation_code || order.activationCode}</p>` : ''}
              <p><a href="${process.env.BASE_URL || 'http://localhost:5000'}/enterprise/download/${downloadToken}">Download eSIM Details</a></p>
            `,
            });

            await db
              .update(enterpriseOrderAllocations)
              .set({ status: 'sent', sentAt: new Date() })
              .where(
                and(
                  eq(enterpriseOrderAllocations.orderId, orderId),
                  eq(enterpriseOrderAllocations.employeeEmail, employeeEmail),
                ),
              );

            distributionResults.push({ email: employeeEmail, status: 'sent', orderId });
          } catch (emailError: any) {
            await db
              .delete(enterpriseOrderAllocations)
              .where(
                and(
                  eq(enterpriseOrderAllocations.orderId, orderId),
                  eq(enterpriseOrderAllocations.employeeEmail, employeeEmail),
                ),
              );

            distributionResults.push({
              email: employeeEmail,
              status: 'failed',
              orderId,
              error: emailError.message,
            });
          }
        }

        res.json({
          message: 'Distribution completed',
          results: distributionResults,
          totalSent: distributionResults.filter((r) => r.status === 'sent').length,
          totalFailed: distributionResults.filter((r) => r.status === 'failed').length,
        });
      } catch (error: any) {
        console.error('Distribute eSIMs error:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Export eSIMs as CSV
  app.get(
    '/api/enterprise/orders/:id/export',
    requireEnterpriseAuth,
    async (req: Request, res: Response) => {
      try {
        const { bulkOrders, orders: ordersTable } = await import('@shared/schema');

        const bulkOrder = await db.query.bulkOrders.findFirst({
          where: and(
            eq(bulkOrders.id, req.params.id),
            eq(bulkOrders.enterpriseAccountId, req.session.enterpriseAccountId!),
          ),
        });

        if (!bulkOrder) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const completedOrders = await db.query.orders.findMany({
          where: and(
            eq(ordersTable.bulkOrderId, bulkOrder.id),
            eq(ordersTable.status, 'completed'),
          ),
        });

        if (completedOrders.length === 0) {
          return res
            .status(400)
            .json({ success: false, message: 'No completed eSIMs available for export' });
        }

        const csvHeader =
          'Order ID,ICCID,Activation Code,SMDP Address,Data Amount,Validity,QR Code URL,Status\n';
        const csvRows = completedOrders
          .map(
            (order) =>
              `${order.id},${order.iccid || ''},${order.activationCode || ''},${order.smdpAddress || ''},${order.dataAmount},${order.validity},${order.qrCodeUrl || ''},${order.status}`,
          )
          .join('\n');

        const csv = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="esims-order-${bulkOrder.id}.csv"`,
        );
        res.send(csv);
      } catch (error: any) {
        console.error('Export eSIMs error:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Download individual eSIM via token
  app.get('/enterprise/download/:token', async (req: Request, res: Response) => {
    try {
      const { enterpriseOrderAllocations, orders: ordersTable } = await import('@shared/schema');

      const allocation = await db.query.enterpriseOrderAllocations.findFirst({
        where: eq(enterpriseOrderAllocations.downloadToken, req.params.token),
        with: {
          order: true,
        },
      });

      if (!allocation) {
        return res.status(404).send('Download link not found or expired');
      }

      const order = allocation.order;

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Your eSIM Details</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            h1 { color: #333; }
            .detail { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
            .label { font-weight: bold; }
            img { max-width: 300px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>Your eSIM Details</h1>
          <div class="detail"><span class="label">ICCID:</span> ${order.iccid || 'Processing'}</div>
          <div class="detail"><span class="label">Data Amount:</span> ${order.dataAmount}</div>
          <div class="detail"><span class="label">Validity:</span> ${order.validity}</div>
          ${order.activationCode ? `<div class="detail"><span class="label">Activation Code:</span> ${order.activationCode}</div>` : ''}
          ${order.smdpAddress ? `<div class="detail"><span class="label">SMDP Address:</span> ${order.smdpAddress}</div>` : ''}
          ${order.qrCodeUrl ? `<div><img src="${order.qrCodeUrl}" alt="QR Code" /></div>` : ''}
        </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Download eSIM error:', error);
      res.status(500).send('Error loading eSIM details');
    }
  });

  // ==================== GIFT CARD ROUTES ====================

  // Get gift card packages
  app.get('/api/gift-cards/packages', async (req: Request, res: Response) => {
    res.json([
      { amount: 25, currency: 'USD' },
      { amount: 50, currency: 'USD' },
      { amount: 100, currency: 'USD' },
      { amount: 200, currency: 'USD' },
    ]);
  });

  // Purchase gift card
  app.post('/api/gift-cards/purchase', requireAuth, async (req: Request, res: Response) => {
    try {
      const { amount, recipientEmail, recipientName, message } = req.body;

      if (!amount || amount < 10) {
        return res.status(400).json({ success: false, message: 'Invalid amount' });
      }

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: 'usd',
        metadata: {
          type: 'gift_card',
          userId: req.session.userId!,
          recipientEmail: recipientEmail || '',
          recipientName: recipientName || '',
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Helper function to generate gift card code
  function generateGiftCardCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = 4;
    const segmentLength = 4;

    const code = [];
    for (let i = 0; i < segments; i++) {
      let segment = '';
      for (let j = 0; j < segmentLength; j++) {
        segment += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      code.push(segment);
    }

    return `GIFT-${code.join('-')}`;
  }

  // Validate gift card
  app.post('/api/gift-cards/validate', requireAuth, async (req: Request, res: Response) => {
    try {
      const { giftCards } = await import('@shared/schema');
      const { code } = req.body;

      const giftCard = await db.query.giftCards.findFirst({
        where: eq(giftCards.code, code.toUpperCase()),
      });

      if (!giftCard) {
        return res.status(404).json({ success: false, message: 'Gift card not found' });
      }

      if (giftCard.status !== 'active') {
        return res.status(400).json({ success: false, message: 'Gift card is not active' });
      }

      if (giftCard.expiresAt && new Date() > new Date(giftCard.expiresAt)) {
        return res.status(400).json({ success: false, message: 'Gift card has expired' });
      }

      if (parseFloat(giftCard.balance) <= 0) {
        return res
          .status(400)
          .json({ success: false, message: 'Gift card has no remaining balance' });
      }

      res.json({
        valid: true,
        balance: giftCard.balance,
        currency: giftCard.currency,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Apply gift card to user account
  app.post('/api/gift-cards/apply', requireAuth, async (req: Request, res: Response) => {
    try {
      const { giftCards } = await import('@shared/schema');
      const { code } = req.body;

      const giftCard = await db.query.giftCards.findFirst({
        where: eq(giftCards.code, code.toUpperCase()),
      });

      if (!giftCard) {
        return res.status(404).json({ success: false, message: 'Gift card not found' });
      }

      if (giftCard.status !== 'active') {
        return res.status(400).json({ success: false, message: 'Gift card is not active' });
      }

      if (giftCard.expiresAt && new Date() > new Date(giftCard.expiresAt)) {
        return res.status(400).json({ success: false, message: 'Gift card has expired' });
      }

      if (parseFloat(giftCard.balance) <= 0) {
        return res
          .status(400)
          .json({ success: false, message: 'Gift card has no remaining balance' });
      }

      // Mark as redeemed
      const [updated] = await db
        .update(giftCards)
        .set({
          status: 'redeemed',
          redeemedBy: req.session.userId,
          redeemedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(giftCards.id, giftCard.id))
        .returning();

      res.json({
        message: 'Gift card applied successfully',
        amount: updated.balance,
        currency: updated.currency,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get user's gift cards
  app.get('/api/gift-cards/my-cards', requireAuth, async (req: Request, res: Response) => {
    try {
      const { giftCards, users: usersTable } = await import('@shared/schema');

      // Get the current user's email
      const currentUser = await db.query.users.findFirst({
        where: eq(usersTable.id, req.userId!),
        columns: { email: true },
      });

      const cards = await db.query.giftCards.findMany({
        where: or(
          eq(giftCards.purchasedBy, req.userId!),
          eq(giftCards.redeemedBy, req.userId!),
          ...(currentUser?.email ? [eq(giftCards.recipientEmail, currentUser.email)] : []),
        ),
        with: {
          purchaser: {
            columns: { id: true, name: true, email: true },
          },
        },
        orderBy: (giftCards, { desc }) => [desc(giftCards.createdAt)],
      });

      ApiResponse.success(res, 'Cards retrieved successfully', cards);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== VOUCHER ROUTES ====================

  // Validate voucher code
  app.post('/api/vouchers/validate', async (req: Request, res: Response) => {
    try {
      const { voucherCodes } = await import('@shared/schema');
      const { code } = req.body;

      const voucher = await db.query.voucherCodes.findFirst({
        where: eq(voucherCodes.code, code.toUpperCase()),
      });

      if (!voucher) {
        return res.status(404).json({ success: false, message: 'Voucher not found' });
      }

      const now = new Date();
      if (now < new Date(voucher.validFrom) || now > new Date(voucher.validUntil)) {
        return res
          .status(400)
          .json({ success: false, message: 'Voucher is not valid at this time' });
      }

      if (voucher.status !== 'active') {
        return res.status(400).json({ success: false, message: 'Voucher is not active' });
      }

      if (voucher.maxUses && voucher.currentUses >= voucher.maxUses) {
        return res
          .status(400)
          .json({ success: false, message: 'Voucher has reached maximum uses' });
      }

      res.json({
        valid: true,
        type: voucher.type,
        value: voucher.value,
        minPurchaseAmount: voucher.minPurchaseAmount,
        description: voucher.description,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // NOTE: Admin gift card routes are handled by server/routes/admin/giftCards.ts
  // NOTE: Admin voucher routes are handled by server/routes/admin/vouchers.ts

  // server/routes/vouchers.ts (or wherever routes live)

  app.post('/api/vouchers/apply', async (req: Request, res: Response) => {
    try {
      const { voucherCodes } = await import('@shared/schema');
      const { code, subtotal } = req.body;

      if (!code || typeof subtotal !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'Voucher code and subtotal are required',
        });
      }

      const voucher = await db.query.voucherCodes.findFirst({
        where: eq(voucherCodes.code, code.toUpperCase()),
      });

      // ❌ Not found
      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: 'Invalid voucher code',
        });
      }

      // ❌ Status
      if (voucher.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Voucher is inactive',
        });
      }

      const now = new Date();

      // ❌ Date check
      if (now < voucher.validFrom || now > voucher.validUntil) {
        return res.status(400).json({
          success: false,
          message: 'Voucher expired',
        });
      }

      // ❌ Usage limit
      if (voucher.maxUses !== null && voucher.currentUses >= voucher.maxUses) {
        return res.status(400).json({
          success: false,
          message: 'Voucher usage limit reached',
        });
      }

      // ❌ Min purchase
      const minPurchase = Number(voucher.minPurchaseAmount);
      if (subtotal < minPurchase) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase amount is ${minPurchase}`,
        });
      }

      // ✅ Calculate discount
      let discount = 0;

      if (voucher.type === 'discount') {
        // percentage
        discount = (subtotal * Number(voucher.value)) / 100;
      } else {
        // fixed
        discount = Number(voucher.value);
      }

      // ✅ Prevent negative total
      discount = Math.min(discount, subtotal);

      const finalTotal = Number((subtotal - discount).toFixed(2));

      res.json({
        success: true,
        voucherId: voucher.id,
        code: voucher.code,
        type: voucher.type,
        discount: Number(discount.toFixed(2)),
        finalTotal,
      });
    } catch (error: any) {
      console.error('Voucher apply error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to apply voucher',
      });
    }
  });

  // NOTE: Voucher usage route is handled by server/routes/admin/vouchers.ts

  // ==================== ANALYTICS TRACKING ROUTES ====================

  // Track analytics event
  app.post('/api/analytics/track', async (req: Request, res: Response) => {
    try {
      const { analyticsEvents, insertAnalyticsEventSchema } = await import('@shared/schema');

      const data = insertAnalyticsEventSchema.parse({
        ...req.body,
        userId: req.session.userId || null,
        ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      });

      await db.insert(analyticsEvents).values(data);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Track abandoned cart
  app.post('/api/analytics/abandoned-cart', async (req: Request, res: Response) => {
    try {
      const { abandonedCarts, insertAbandonedCartSchema } = await import('@shared/schema');

      const data = insertAbandonedCartSchema.parse({
        ...req.body,
        userId: req.session.userId || null,
      });

      await db.insert(abandonedCarts).values(data);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ADMIN ANALYTICS ROUTES ====================

  // Get analytics overview
  app.get('/api/admin/analytics/overview', requireAdmin, async (req: Request, res: Response) => {
    try {
      const {
        orders: ordersTable,
        users: usersTable,
        analyticsEvents,
      } = await import('@shared/schema');

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Total revenue
      const revenueResult = await db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(${ordersTable.price} AS DECIMAL)), 0)`,
        })
        .from(ordersTable)
        .where(eq(ordersTable.status, 'completed'));

      // Active users (last 30 days)
      const activeUsersResult = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${analyticsEvents.userId})`,
        })
        .from(analyticsEvents)
        .where(gte(analyticsEvents.createdAt, thirtyDaysAgo));

      // Conversion rate
      const visitorsResult = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${analyticsEvents.sessionId})`,
        })
        .from(analyticsEvents)
        .where(eq(analyticsEvents.eventType, 'page_view'));

      const purchasesResult = await db
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(ordersTable)
        .where(eq(ordersTable.status, 'completed'));

      const conversionRate =
        visitorsResult[0]?.count > 0
          ? ((purchasesResult[0]?.count / visitorsResult[0]?.count) * 100).toFixed(2)
          : 0;

      // Average order value
      const avgOrderValue =
        purchasesResult[0]?.count > 0
          ? (revenueResult[0]?.total / purchasesResult[0]?.count).toFixed(2)
          : 0;

      res.json({
        totalRevenue: revenueResult[0]?.total || 0,
        activeUsers: activeUsersResult[0]?.count || 0,
        conversionRate: conversionRate,
        avgOrderValue: avgOrderValue,
        totalOrders: purchasesResult[0]?.count || 0,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get funnel data
  app.get('/api/admin/analytics/funnel', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { analyticsEvents } = await import('@shared/schema');

      const pageViews = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${analyticsEvents.sessionId})`,
        })
        .from(analyticsEvents)
        .where(eq(analyticsEvents.eventType, 'page_view'));

      const packageViews = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${analyticsEvents.sessionId})`,
        })
        .from(analyticsEvents)
        .where(eq(analyticsEvents.eventType, 'package_view'));

      const checkoutStarts = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${analyticsEvents.sessionId})`,
        })
        .from(analyticsEvents)
        .where(eq(analyticsEvents.eventType, 'checkout_start'));

      const purchases = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${analyticsEvents.sessionId})`,
        })
        .from(analyticsEvents)
        .where(eq(analyticsEvents.eventType, 'purchase'));

      res.json({
        visitors: pageViews[0]?.count || 0,
        packageViews: packageViews[0]?.count || 0,
        checkoutStarts: checkoutStarts[0]?.count || 0,
        purchases: purchases[0]?.count || 0,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get customer segments
  app.get('/api/admin/analytics/segments', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { customerSegments } = await import('@shared/schema');

      const segments = await db.query.customerSegments.findMany({
        orderBy: (customerSegments, { desc }) => [desc(customerSegments.createdAt)],
      });

      ApiResponse.success(res, 'Segments retrieved successfully', segments);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Create customer segment
  app.post('/api/admin/analytics/segments', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { customerSegments, insertCustomerSegmentSchema } = await import('@shared/schema');

      const data = insertCustomerSegmentSchema.parse(req.body);
      const [segment] = await db.insert(customerSegments).values(data).returning();

      ApiResponse.success(res, 'Segment operation successful', segment);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // Get abandoned carts
  app.get(
    '/api/admin/analytics/abandoned-carts',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { abandonedCarts } = await import('@shared/schema');

        const carts = await db.query.abandonedCarts.findMany({
          with: {
            user: true,
            package: true,
          },
          orderBy: (abandonedCarts, { desc }) => [desc(abandonedCarts.createdAt)],
        });

        ApiResponse.success(res, 'Carts retrieved successfully', carts);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // ==================== EMAIL MARKETING ROUTES ====================

  // List all campaigns
  app.get('/api/admin/email/campaigns', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { emailCampaigns } = await import('@shared/schema');

      const campaigns = await db.query.emailCampaigns.findMany({
        with: {
          segment: true,
        },
        orderBy: (emailCampaigns, { desc }) => [desc(emailCampaigns.createdAt)],
      });

      ApiResponse.success(res, 'Campaigns retrieved successfully', campaigns);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Create campaign
  app.post('/api/admin/email/campaigns', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { emailCampaigns, insertEmailCampaignSchema } = await import('@shared/schema');
      const data = insertEmailCampaignSchema.parse({
        ...req.body,
        createdBy: req.session.adminId,
      });

      console.log(data);

      const [campaign] = await db.insert(emailCampaigns).values(data).returning();

      ApiResponse.success(res, 'Campaign operation successful', campaign);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // Update campaign
  app.put('/api/admin/email/campaigns/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { emailCampaigns } = await import('@shared/schema');

      const [updated] = await db
        .update(emailCampaigns)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(emailCampaigns.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      ApiResponse.success(res, 'Updated successfully', updated);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Delete campaign
  app.delete(
    '/api/admin/email/campaigns/:id',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { emailCampaigns } = await import('@shared/schema');

        const [deleted] = await db
          .delete(emailCampaigns)
          .where(eq(emailCampaigns.id, req.params.id))
          .returning();

        if (!deleted) {
          return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        res.json({ success: true, message: 'Campaign deleted' });
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // List all automations
  app.get('/api/admin/email/automations', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { emailAutomations } = await import('@shared/schema');

      const automations = await db.query.emailAutomations.findMany({
        orderBy: (emailAutomations, { desc }) => [desc(emailAutomations.createdAt)],
      });

      ApiResponse.success(res, 'Automations retrieved successfully', automations);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Create automation
  app.post('/api/admin/email/automations', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { emailAutomations, insertEmailAutomationSchema } = await import('@shared/schema');

      const data = insertEmailAutomationSchema.parse(req.body);
      const [automation] = await db.insert(emailAutomations).values(data).returning();

      ApiResponse.success(res, 'Automation operation successful', automation);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // Update automation
  app.put('/api/admin/email/automations/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { emailAutomations } = await import('@shared/schema');

      const [updated] = await db
        .update(emailAutomations)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(emailAutomations.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Automation not found' });
      }

      ApiResponse.success(res, 'Updated successfully', updated);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Delete automation
  app.delete(
    '/api/admin/email/automations/:id',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { emailAutomations } = await import('@shared/schema');

        const [deleted] = await db
          .delete(emailAutomations)
          .where(eq(emailAutomations.id, req.params.id))
          .returning();

        if (!deleted) {
          return res.status(404).json({ success: false, message: 'Automation not found' });
        }

        res.json({ success: true, message: 'Automation deleted' });
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Toggle automation
  app.post(
    '/api/admin/email/automations/:id/toggle',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { emailAutomations } = await import('@shared/schema');

        const automation = await db.query.emailAutomations.findFirst({
          where: eq(emailAutomations.id, req.params.id),
        });

        if (!automation) {
          return res.status(404).json({ success: false, message: 'Automation not found' });
        }

        const [updated] = await db
          .update(emailAutomations)
          .set({
            enabled: !automation.enabled,
            updatedAt: new Date(),
          })
          .where(eq(emailAutomations.id, req.params.id))
          .returning();

        ApiResponse.success(res, 'Updated successfully', updated);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Get email subscriptions
  app.get('/api/admin/email/subscriptions', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { emailSubscriptions } = await import('@shared/schema');

      const subscriptions = await db.query.emailSubscriptions.findMany({
        with: {
          user: true,
        },
        orderBy: (emailSubscriptions, { desc }) => [desc(emailSubscriptions.createdAt)],
      });

      ApiResponse.success(res, 'Subscriptions retrieved successfully', subscriptions);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ADMIN - REGIONS & DESTINATIONS ====================

  // Get all regions with package counts
  app.get('/api/admin/master-regions', requireAdmin, async (req: Request, res: Response) => {
    try {
      const search = (req.query.search as string)?.trim() || '';

      // Get regions with SQL-level filtering
      let query = db.select().from(regions);

      if (search) {
        query = query.where(
          or(ilike(regions.name, `%${search}%`), ilike(regions.slug, `%${search}%`)),
        ) as typeof query;
      }

      const regionsData = await query.orderBy(regions.name);

      // Get package counts per region from all providers
      const airaloCountsResult = await db.execute(sql`
        SELECT region_id, COUNT(*)::int as count 
        FROM airalo_packages 
        WHERE region_id IS NOT NULL 
        GROUP BY region_id
      `);
      const airaloCounts = new Map(
        (airaloCountsResult.rows as any[])?.map((r) => [r.region_id, r.count]) || [],
      );

      const esimAccessCountsResult = await db.execute(sql`
        SELECT region_id, COUNT(*)::int as count 
        FROM esim_access_packages 
        WHERE region_id IS NOT NULL 
        GROUP BY region_id
      `);
      const esimAccessCounts = new Map(
        (esimAccessCountsResult.rows as any[])?.map((r) => [r.region_id, r.count]) || [],
      );

      const esimGoCountsResult = await db.execute(sql`
        SELECT region_id, COUNT(*)::int as count 
        FROM esim_go_packages 
        WHERE region_id IS NOT NULL 
        GROUP BY region_id
      `);
      const esimGoCounts = new Map(
        (esimGoCountsResult.rows as any[])?.map((r) => [r.region_id, r.count]) || [],
      );

      const mayaCountsResult = await db.execute(sql`
        SELECT region_id, COUNT(*)::int as count 
        FROM maya_packages 
        WHERE region_id IS NOT NULL 
        GROUP BY region_id
      `);
      const mayaCounts = new Map(
        (mayaCountsResult.rows as any[])?.map((r) => [r.region_id, r.count]) || [],
      );

      // Combine data with counts
      const regionsWithCounts = regionsData.map((region) => ({
        ...region,
        packageCounts: {
          airalo: airaloCounts.get(region.id) || 0,
          esimAccess: esimAccessCounts.get(region.id) || 0,
          esimGo: esimGoCounts.get(region.id) || 0,
          maya: mayaCounts.get(region.id) || 0,
          total:
            (airaloCounts.get(region.id) || 0) +
            (esimAccessCounts.get(region.id) || 0) +
            (esimGoCounts.get(region.id) || 0) +
            (mayaCounts.get(region.id) || 0),
        },
      }));

      ApiResponse.success(res, 'Regions fetched successfully', regionsWithCounts);
    } catch (error: any) {
      console.error('Error fetching regions:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Update region (image/icon)
  app.patch('/api/admin/master-regions/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { image, bannerImage, active, isTop } = req.body;


      const updateData: any = { updatedAt: new Date() };
      if (image !== undefined) updateData.image = image;
      if (bannerImage !== undefined) updateData.bannerImage = bannerImage;
      if (active !== undefined) updateData.active = active;
      if (isTop !== undefined) updateData.isTop = isTop;

      const [updated] = await db
        .update(regions)
        .set(updateData)
        .where(eq(regions.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Region not found' });
      }

      ApiResponse.success(res, 'Region updated successfully', updated);
    } catch (error: any) {
      console.error('Error updating region:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get all destinations/countries with package counts
  app.get('/api/admin/master-countries', requireAdmin, async (req: Request, res: Response) => {
    try {
      const search = (req.query.search as string)?.trim() || '';
      const filterType = req.query.type as string; // 'country', 'territory', or 'all'

      // Build where conditions for SQL-level filtering
      const conditions: any[] = [];

      if (search) {
        conditions.push(
          or(
            ilike(destinations.name, `%${search}%`),
            ilike(destinations.slug, `%${search}%`),
            ilike(destinations.countryCode, `%${search}%`),
          ),
        );
      }

      if (filterType === 'country') {
        conditions.push(eq(destinations.isTerritory, false));
      } else if (filterType === 'territory') {
        conditions.push(eq(destinations.isTerritory, true));
      }

      // Get destinations with SQL-level filtering
      let destQuery = db.select().from(destinations);
      if (conditions.length > 0) {
        destQuery = destQuery.where(and(...conditions)) as typeof destQuery;
      }
      const destinationsData = await destQuery.orderBy(destinations.name);

      // Get package counts per destination from all providers
      const airaloDestCountsResult = await db.execute(sql`
        SELECT destination_id, COUNT(*)::int as count 
        FROM airalo_packages 
        WHERE destination_id IS NOT NULL 
        GROUP BY destination_id
      `);
      const airaloCounts = new Map(
        (airaloDestCountsResult.rows as any[])?.map((r) => [r.destination_id, r.count]) || [],
      );

      const esimAccessDestCountsResult = await db.execute(sql`
        SELECT destination_id, COUNT(*)::int as count 
        FROM esim_access_packages 
        WHERE destination_id IS NOT NULL 
        GROUP BY destination_id
      `);
      const esimAccessCounts = new Map(
        (esimAccessDestCountsResult.rows as any[])?.map((r) => [r.destination_id, r.count]) || [],
      );

      const esimGoDestCountsResult = await db.execute(sql`
        SELECT destination_id, COUNT(*)::int as count 
        FROM esim_go_packages 
        WHERE destination_id IS NOT NULL 
        GROUP BY destination_id
      `);
      const esimGoCounts = new Map(
        (esimGoDestCountsResult.rows as any[])?.map((r) => [r.destination_id, r.count]) || [],
      );

      const mayaDestCountsResult = await db.execute(sql`
        SELECT destination_id, COUNT(*)::int as count 
        FROM maya_packages 
        WHERE destination_id IS NOT NULL 
        GROUP BY destination_id
      `);
      const mayaCounts = new Map(
        (mayaDestCountsResult.rows as any[])?.map((r) => [r.destination_id, r.count]) || [],
      );

      // Combine data with counts
      const destinationsWithCounts = destinationsData.map((dest) => ({
        ...dest,
        packageCounts: {
          airalo: airaloCounts.get(dest.id) || 0,
          esimAccess: esimAccessCounts.get(dest.id) || 0,
          esimGo: esimGoCounts.get(dest.id) || 0,
          maya: mayaCounts.get(dest.id) || 0,
          total:
            (airaloCounts.get(dest.id) || 0) +
            (esimAccessCounts.get(dest.id) || 0) +
            (esimGoCounts.get(dest.id) || 0) +
            (mayaCounts.get(dest.id) || 0),
        },
      }));

      // Stats
      const stats = {
        total: destinationsData.length,
        countries: destinationsData.filter((d) => !d.isTerritory).length,
        territories: destinationsData.filter((d) => d.isTerritory).length,
      };

      ApiResponse.success(res, 'Countries fetched successfully', {
        destinations: destinationsWithCounts,
        stats,
      });
    } catch (error: any) {
      console.error('Error fetching countries:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Update destination/country (image/icon)
  app.patch(
    '/api/admin/master-countries/:id',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { image, bannerImage, active, isTop } = req.body;

        const updateData: any = { updatedAt: new Date() };
        if (image !== undefined) updateData.image = image;
        if (bannerImage !== undefined) updateData.bannerImage = bannerImage;
        if (active !== undefined) updateData.active = active;
        if (isTop !== undefined) updateData.isTop = isTop;

        const [updated] = await db
          .update(destinations)
          .set(updateData)
          .where(eq(destinations.id, id))
          .returning();

        if (!updated) {
          return res.status(404).json({ success: false, message: 'Destination not found' });
        }

        ApiResponse.success(res, 'Country updated successfully', updated);
      } catch (error: any) {
        console.error('Error updating country:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Sync regions from all providers
  app.post('/api/admin/master-regions/sync', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { regionSyncService } = await import('./services/sync/region-sync');
      const result = await regionSyncService.runFullSync();

      if (result.success) {
        ApiResponse.success(res, 'Region sync completed successfully', {
          regionsCreated: result.regionsCreated,
          regionsUpdated: result.regionsUpdated,
          packagesLinked: result.packagesLinked,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Region sync completed with errors',
          errors: result.errors,
          data: {
            regionsCreated: result.regionsCreated,
            regionsUpdated: result.regionsUpdated,
          },
        });
      }
    } catch (error: any) {
      console.error('Error syncing regions:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Sync destinations/countries from all providers
  app.post(
    '/api/admin/master-countries/sync',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { destinationSyncService } = await import('./services/sync/destination-sync');
        const result = await destinationSyncService.runFullSync();

        if (result.success) {
          ApiResponse.success(res, 'Destination sync completed successfully', {
            destinationsCreated: result.destinationsCreated,
            destinationsUpdated: result.destinationsUpdated,
            packagesLinked: result.packagesLinked,
          });
        } else {
          res.status(500).json({
            success: false,
            message: 'Destination sync completed with errors',
            errors: result.errors,
            data: {
              destinationsCreated: result.destinationsCreated,
              destinationsUpdated: result.destinationsUpdated,
            },
          });
        }
      } catch (error: any) {
        console.error('Error syncing destinations:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // ==================== IMAGE UPLOAD ROUTES ====================

  // Upload region image
  app.post(
    '/api/admin/master-regions/:id/upload-image',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { regionImageUpload } = await import('./middleware/image-upload');

        regionImageUpload.single('image')(req, res, async (err: any) => {
          try {
            if (err) {
              return res.status(400).json({ success: false, message: err.message });
            }

            if (!req.file) {
              return res.status(400).json({ success: false, message: 'No image file provided' });
            }

            const { id } = req.params;
            const imageUrl = `/uploads/regions/${req.file.filename}`;

            const [updated] = await db
              .update(regions)
              .set({ image: imageUrl, updatedAt: new Date() })
              .where(eq(regions.id, id))
              .returning();

            if (!updated) {
              return res.status(404).json({ success: false, message: 'Region not found' });
            }

            ApiResponse.success(res, 'Image uploaded successfully', {
              image: imageUrl,
              region: updated,
            });
          } catch (innerError: any) {
            console.error('Error processing region image upload:', innerError);
            res.status(500).json({ success: false, message: innerError.message });
          }
        });
      } catch (error: any) {
        console.error('Error uploading region image:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  app.post(
    '/api/admin/master-regions/:id/upload-banner',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { regionImageUpload } = await import('./middleware/image-upload');

        regionImageUpload.single('image')(req, res, async (err: any) => {
          try {
            if (err) {
              return res.status(400).json({ success: false, message: err.message });
            }

            if (!req.file) {
              return res.status(400).json({ success: false, message: 'No image file provided' });
            }

            const { id } = req.params;
            const imageUrl = `/uploads/regions/${req.file.filename}`;

            const [updated] = await db
              .update(regions)
              .set({ bannerImage: imageUrl, updatedAt: new Date() })
              .where(eq(regions.id, id))
              .returning();

            if (!updated) {
              return res.status(404).json({ success: false, message: 'Region not found' });
            }

            ApiResponse.success(res, 'Banner image uploaded successfully', {
              bannerImage: imageUrl,
              region: updated,
            });
          } catch (innerError: any) {
            console.error('Error processing region banner image upload:', innerError);
            res.status(500).json({ success: false, message: innerError.message });
          }
        });
      } catch (error: any) {
        console.error('Error uploading region banner image:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Upload country/destination image
  app.post(
    '/api/admin/master-countries/:id/upload-image',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { countryImageUpload } = await import('./middleware/image-upload');

        countryImageUpload.single('image')(req, res, async (err: any) => {
          try {
            if (err) {
              return res.status(400).json({ success: false, message: err.message });
            }

            if (!req.file) {
              return res.status(400).json({ success: false, message: 'No image file provided' });
            }

            const { id } = req.params;
            const imageUrl = `/uploads/countries/${req.file.filename}`;

            const [updated] = await db
              .update(destinations)
              .set({ image: imageUrl, updatedAt: new Date() })
              .where(eq(destinations.id, id))
              .returning();

            if (!updated) {
              return res.status(404).json({ success: false, message: 'Country not found' });
            }

            ApiResponse.success(res, 'Image uploaded successfully', {
              image: imageUrl,
              destination: updated,
            });
          } catch (innerError: any) {
            console.error('Error processing country image upload:', innerError);
            res.status(500).json({ success: false, message: innerError.message });
          }
        });
      } catch (error: any) {
        console.error('Error uploading country image:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Upload country banner image
  app.post(
    '/api/admin/master-countries/:id/upload-banner',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { countryImageUpload } = await import('./middleware/image-upload');

        countryImageUpload.single('image')(req, res, async (err: any) => {
          try {
            if (err) {
              return res.status(400).json({ success: false, message: err.message });
            }

            if (!req.file) {
              return res.status(400).json({ success: false, message: 'No image file provided' });
            }

            const { id } = req.params;
            const imageUrl = `/uploads/countries/${req.file.filename}`;

            const [updated] = await db
              .update(destinations)
              .set({ bannerImage: imageUrl, updatedAt: new Date() })
              .where(eq(destinations.id, id))
              .returning();

            if (!updated) {
              return res.status(404).json({ success: false, message: 'Country not found' });
            }

            ApiResponse.success(res, 'Banner image uploaded successfully', {
              bannerImage: imageUrl,
              destination: updated,
            });
          } catch (innerError: any) {
            console.error('Error processing country banner image upload:', innerError);
            res.status(500).json({ success: false, message: innerError.message });
          }
        });
      } catch (error: any) {
        console.error('Error uploading country banner image:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // ==================== PAYMENT SETTINGS ROUTES ====================

  // Get payment settings
  app.get('/api/admin/payment-settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { paymentSettings } = await import('@shared/schema');

      const settings = await db.query.paymentSettings.findMany();

      ApiResponse.success(res, 'Settings retrieved successfully', settings);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Update payment setting
  app.put('/api/admin/payment-settings/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { paymentSettings } = await import('@shared/schema');

      const [updated] = await db
        .update(paymentSettings)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(paymentSettings.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Payment setting not found' });
      }

      ApiResponse.success(res, 'Updated successfully', updated);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== INTERNATIONALIZATION ROUTES ====================

  // Public: Get enabled languages for language selector
  app.get('/api/languages', async (req: Request, res: Response) => {
    try {
      const enabledLanguages = await storage.getEnabledLanguages();
      ApiResponse.success(res, 'Languages retrieved', enabledLanguages);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Public: Get translations for a language (by code or id)

  /* ===================== HELPER ===================== */

  function setDeep(obj: any, path: string[], value: any) {
    let current = obj;

    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      const isLast = i === path.length - 1;
      const nextKey = path[i + 1];
      const nextIsIndex = !isNaN(Number(nextKey));

      // 🔢 numeric index → array
      if (!isNaN(Number(key))) {
        const index = Number(key);

        if (!Array.isArray(current)) {
          // 🔥 force convert
          current = [];
        }

        if (isLast) {
          current[index] = value;
          return;
        }

        if (!current[index]) {
          current[index] = nextIsIndex ? [] : {};
        }

        current = current[index];
        continue;
      }

      // 🔤 object key
      if (isLast) {
        current[key] = value;
        return;
      }

      if (
        typeof current[key] !== 'object' ||
        current[key] === null
      ) {
        // 🔥 override anything (string / number / null)
        current[key] = nextIsIndex ? [] : {};
      }

      current = current[key];
    }
  }



  /* ===================== API ===================== */

  // app.get('/api/translations/:languageCode', async (req: Request, res: Response) => {
  //   try {
  //     const { languageCode } = req.params;
  //     const { namespace } = req.query;

  //     // 🔎 Find language
  //     const language = await storage.getLanguageByCode(languageCode);
  //     if (!language) {
  //       return res
  //         .status(404)
  //         .json({ success: false, message: 'Language not found' });
  //     }

  //     let translations;

  //     /* ===================== SINGLE NAMESPACE ===================== */
  //     if (namespace && typeof namespace === 'string') {
  //       translations = await storage.getTranslationsForNamespace(
  //         namespace,
  //         language.id
  //       );

  //       const result: Record<string, any> = {};

  //       translations.forEach((t) => {
  //         let parsedValue: any = t.value;

  //         // ✅ JSON auto-parse
  //         if (
  //           typeof t.value === 'string' &&
  //           (t.value.startsWith('{') || t.value.startsWith('['))
  //         ) {
  //           try {
  //             parsedValue = JSON.parse(t.value);
  //           } catch {
  //             parsedValue = t.value;
  //           }
  //         }

  //         const path = t.key.split('.');
  //         setDeep(result, path, parsedValue);
  //       });

  //       return res.json({
  //         success: true,
  //         message: 'Translations retrieved',
  //         data: {
  //           language,
  //           namespace,
  //           translations: result,
  //         },
  //       });
  //     }

  //     /* ===================== ALL NAMESPACES ===================== */
  //     translations = await storage.getTranslationsForLanguage(language.id);

  //     const grouped: Record<string, any> = {};

  //     translations.forEach((t) => {
  //       if (!grouped[t.namespace]) grouped[t.namespace] = {};

  //       let parsedValue: any = t.value;

  //       // ✅ JSON auto-parse
  //       if (
  //         typeof t.value === 'string' &&
  //         (t.value.startsWith('{') || t.value.startsWith('['))
  //       ) {
  //         try {
  //           parsedValue = JSON.parse(t.value);
  //         } catch {
  //           parsedValue = t.value;
  //         }
  //       }

  //       const path = t.key.split('.');
  //       setDeep(grouped[t.namespace], path, parsedValue);
  //     });

  //     return res.json({
  //       success: true,
  //       message: 'Translations retrieved',
  //       data: {
  //         language,
  //         translations: grouped,
  //       },
  //     });
  //   } catch (error: any) {
  //     console.error('Translations API error:', error);
  //     return res.status(500).json({
  //       success: false,
  //       message: error.message || 'Internal Server Error',
  //     });
  //   }
  // });



  app.get('/api/translations/:languageCode', async (req: Request, res: Response) => {
    try {
      const { languageCode } = req.params;
      const { namespace } = req.query;

      // Find language by code
      const language = await storage.getLanguageByCode(languageCode);
      if (!language) {
        return res.status(404).json({ success: false, message: 'Language not found' });
      }

      let translations;
      if (namespace && typeof namespace === 'string') {
        // Get translations for specific namespace
        translations = await storage.getTranslationsForNamespace(namespace, language.id);
        // Convert to object format
        const translationObj: Record<string, string> = {};
        translations.forEach((t) => {
          translationObj[t.key] = t.value;
        });
        ApiResponse.success(res, 'Translations retrieved', {
          language,
          namespace,
          translations: translationObj,
        });
      } else {
        // Get all translations for language
        translations = await storage.getTranslationsForLanguage(language.id);
        // Group by namespace
        const grouped: Record<string, Record<string, string>> = {};
        translations.forEach((t) => {
          if (!grouped[t.namespace]) grouped[t.namespace] = {};
          grouped[t.namespace][t.key] = t.value;
        });
        ApiResponse.success(res, 'Translations retrieved', {
          language,
          translations: grouped,
        });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Get all languages (including disabled)
  app.get('/api/admin/languages', requireAdmin, async (req: Request, res: Response) => {
    try {
      const allLanguages = await storage.getAllLanguages();
      ApiResponse.success(res, 'Languages retrieved', allLanguages);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Create a new language
  app.post('/api/admin/languages', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { languages: langTable, insertLanguageSchema } = await import('@shared/schema');
      const parsed = insertLanguageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid language data', errors: parsed.error.errors });
      }

      const language = await storage.createLanguage(parsed.data);
      ApiResponse.success(res, 'Language created', language);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Update a language
  app.put('/api/admin/languages/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateLanguage(id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Language not found' });
      }
      ApiResponse.success(res, 'Language updated', updated);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Set default language
  app.post(
    '/api/admin/languages/:id/set-default',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        await storage.setDefaultLanguage(id);
        const language = await storage.getLanguageById(id);
        ApiResponse.success(res, 'Default language updated', language);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Admin: Delete a language
  app.delete('/api/admin/languages/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const language = await storage.getLanguageById(id);
      if (!language) {
        return res.status(404).json({ success: false, message: 'Language not found' });
      }
      if (language.isDefault) {
        return res.status(400).json({ success: false, message: 'Cannot delete default language' });
      }
      await storage.deleteLanguage(id);
      ApiResponse.success(res, 'Language deleted');
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Get all translation namespaces
  app.get('/api/admin/translations/namespaces', requireAdmin, async (req: Request, res: Response) => {
    try {
      const namespaces = await storage.getTranslationNamespaces();
      ApiResponse.success(res, 'Translation namespaces retrieved', namespaces);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Get all translation keys
  app.get('/api/admin/translations/keys', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { namespace } = req.query;
      let keys;
      if (namespace && typeof namespace === 'string') {
        keys = await storage.getTranslationKeysByNamespace(namespace);
      } else {
        keys = await storage.getAllTranslationKeys();
      }
      ApiResponse.success(res, 'Translation keys retrieved', keys);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Create translation key
  app.post('/api/admin/translations/keys', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { insertTranslationKeySchema } = await import('@shared/schema');
      const parsed = insertTranslationKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid key data', errors: parsed.error.errors });
      }
      const key = await storage.createTranslationKey(parsed.data);
      ApiResponse.success(res, 'Translation key created', key);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Update translation key
  app.put('/api/admin/translations/keys/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateTranslationKey(id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Translation key not found' });
      }
      ApiResponse.success(res, 'Translation key updated', updated);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Delete translation key
  app.delete(
    '/api/admin/translations/keys/:id',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        await storage.deleteTranslationKey(id);
        ApiResponse.success(res, 'Translation key deleted');
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Admin: Get translations for a specific language with key info
  app.get(
    '/api/admin/translations/:languageId',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { languageId } = req.params;
        const { namespace } = req.query;

        const language = await storage.getLanguageById(languageId);
        if (!language) {
          return res.status(404).json({ success: false, message: 'Language not found' });
        }

        // Get all keys
        let keys;
        if (namespace && typeof namespace === 'string') {
          keys = await storage.getTranslationKeysByNamespace(namespace);
        } else {
          keys = await storage.getAllTranslationKeys();
        }

        // Get translations for this language
        const translations = await storage.getTranslationsForLanguage(languageId);
        const translationMap = new Map(
          translations.map((t) => [`${t.namespace}.${t.key}`, t.value]),
        );

        // Combine keys with their translations
        const result = keys.map((k) => ({
          ...k,
          value: translationMap.get(`${k.namespace}.${k.key}`) || null,
          isMissing: !translationMap.has(`${k.namespace}.${k.key}`),
        }));

        // Calculate stats based on the filtered keys (not all translations)
        const translatedCount = result.filter((r) => !r.isMissing).length;
        const missingCount = result.filter((r) => r.isMissing).length;

        ApiResponse.success(res, 'Translations retrieved', {
          language,
          translations: result,
          stats: {
            total: keys.length,
            translated: translatedCount,
            missing: missingCount,
          },
        });
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Admin: Update or create a translation value
  app.put(
    '/api/admin/translations/:languageId/:keyId',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { languageId, keyId } = req.params;
        const { value, isVerified } = req.body;

        if (!value || typeof value !== 'string') {
          return res.status(400).json({ success: false, message: 'Value is required' });
        }

        const translation = await storage.upsertTranslationValue({
          keyId,
          languageId,
          value,
          isVerified: isVerified || false,
          verifiedBy: isVerified ? (req as any).admin?.id : null,
          verifiedAt: isVerified ? new Date() : null,
        });

        ApiResponse.success(res, 'Translation saved', translation);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Admin: Get missing translations for a language
  app.get(
    '/api/admin/translations/:languageId/missing',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { languageId } = req.params;
        const missingKeys = await storage.getMissingTranslations(languageId);
        ApiResponse.success(res, 'Missing translations retrieved', missingKeys);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Admin: Bulk import translations (for a language)
  app.post(
    '/api/admin/translations/:languageId/import',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { languageId } = req.params;
        const { translations } = req.body; // { namespace: { key: value, ... }, ... }

        if (!translations || typeof translations !== 'object') {
          return res.status(400).json({ success: false, message: 'Invalid translations data' });
        }

        const language = await storage.getLanguageById(languageId);
        if (!language) {
          return res.status(404).json({ success: false, message: 'Language not found' });
        }

        let imported = 0;
        for (const [namespace, keys] of Object.entries(translations)) {
          if (typeof keys !== 'object' || keys === null) continue;

          for (const [key, value] of Object.entries(keys as Record<string, string>)) {
            // Find or create key
            const allKeys = await storage.getTranslationKeysByNamespace(namespace);
            let keyRecord = allKeys.find((k) => k.key === key);

            if (!keyRecord) {
              keyRecord = await storage.createTranslationKey({ namespace, key });
            }

            // Upsert the value
            await storage.upsertTranslationValue({
              keyId: keyRecord.id,
              languageId,
              value: value as string,
            });
            imported++;
          }
        }

        ApiResponse.success(res, `Imported ${imported} translations`);
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  // Admin: Export translations for a language
  app.get(
    '/api/admin/translations/:languageId/export',
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { languageId } = req.params;
        const { format } = req.query;

        const language = await storage.getLanguageById(languageId);
        if (!language) {
          return res.status(404).json({ success: false, message: 'Language not found' });
        }

        const translations = await storage.getTranslationsForLanguage(languageId);

        // Group by namespace
        const grouped: Record<string, Record<string, string>> = {};
        translations.forEach((t) => {
          if (!grouped[t.namespace]) grouped[t.namespace] = {};
          grouped[t.namespace][t.key] = t.value;
        });

        if (format === 'json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${language.code}_translations.json"`,
          );
          return res.json(grouped);
        }

        ApiResponse.success(res, 'Export ready', {
          language,
          translations: grouped,
        });
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    },
  );

  const httpServer = createServer(app);
  return httpServer;
}
