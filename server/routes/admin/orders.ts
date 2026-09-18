"use strict";

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { asyncHandler } from "../../lib/asyncHandler";
import { NotFoundError } from "../../lib/errors";
import { requireAdmin } from "../../lib/middleware";
import { logger } from "../../lib/logger";
import { orders, airaloPackages, providers } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import * as ApiResponse from "../../utils/response";
import { refundService } from "../../services/refund-service";

const router = Router();

// router.get(
//   "/",
//   requireAdmin,
//   asyncHandler(async (req: Request, res: Response) => {

//     try {
//       const orders = await storage.getAllOrders();
//       const providers = await storage.getAllProviders();
//       const providerMap = new Map(providers.map(p => [p.id, p.name]));

//       const ordersWithDetails = await Promise.all(
//         orders.map(async (order) => {
//           const user = await storage.getUser(order.userId);
//           const pkg = await storage.getPackageById(order.packageId);
//           let destination;
//           if (pkg?.destinationId) {
//             destination = await storage.getDestinationById(pkg.destinationId);
//           }
//           // console.log("order", order);
//           // Add provider names for failover display
//           const originalProviderName = order.originalProviderId ? providerMap.get(order.originalProviderId) : undefined;
//           const finalProviderName = order.finalProviderId ? providerMap.get(order.finalProviderId) : undefined;

//           return {
//             ...order,
//             user,
//             package: { ...pkg, destination },
//             originalProviderName,
//             finalProviderName,
//           };
//         })
//       );

//       ApiResponse.success(res, "Orders retrieved successfully", ordersWithDetails);
//     } catch (error: any) {
//       res.status(500).json({ success: false, message: error.message });
//     }
//   })
// );




router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const orders = await storage.getAllOrders();
      const providers = await storage.getAllProviders().catch(() => []);
      const providerMap = new Map((providers || []).map((p: any) => [p.id, p.name]));

      const ordersWithDetails = await Promise.all(
        orders.map(async (order) => {
          let user = null;
          try {
            if (order.userId) {
              user = await storage.getUser(order.userId);
            }
          } catch (err) {
            logger.warn(`Failed to fetch user for order ${order.id}`, { error: err });
          }

          let pkg: any = null;
          try {
            if (order.packageId) {
              pkg = await storage.getUnifiedPackageById(order.packageId);
              if (!pkg) {
                const { resolvePackage } = await import("../../services/packages/package-resolver");
                pkg = await resolvePackage(order.packageId);
              }
              if (!pkg) {
                pkg = await storage.getPackageById(order.packageId);
              }
            }
          } catch (err) {
            logger.warn(`Failed to fetch package for order ${order.id}`, { error: err });
          }

          if (!pkg) {
            pkg = {
              id: order.packageId,
              title: order.dataAmount ? `${order.dataAmount} - ${order.validity} Days` : "eSIM Package",
              name: order.dataAmount ? `${order.dataAmount} - ${order.validity} Days` : "eSIM Package",
              dataAmount: order.dataAmount,
              validity: order.validity,
            };
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
            logger.warn(`Failed to fetch destination for order ${order.id}`, { error: err });
          }

          if (!destination) {
            destination = {
              name: "Global / Regional",
              countryCode: "GL",
            };
          }

          const originalProviderName = order.originalProviderId
            ? providerMap.get(order.originalProviderId)
            : undefined;

          const finalProviderName = order.finalProviderId
            ? providerMap.get(order.finalProviderId)
            : undefined;

          return {
            ...order,
            user: user || (order.guestEmail ? { email: order.guestEmail, name: "Guest" } : null),
            package: pkg ? { ...pkg, destination } : null,
            originalProviderName,
            finalProviderName,
          };
        })
      );

      ApiResponse.success(res, "Orders retrieved successfully", ordersWithDetails);
    } catch (error: any) {
      console.error("[Admin Orders] Error fetching orders:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  })
);


router.get(
  "/:id",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const order = await storage.getOrderById(req.params.id);
    if (!order) {
      return ApiResponse.notFound(res, "Order not found");
    }

    let user = null;
    try {
      if (order.userId) {
        user = await storage.getUser(order.userId);
      }
    } catch (err) {
      logger.warn(`Failed to fetch user for order ${order.id}`, { error: err });
    }

    let pkg: any = null;
    try {
      if (order.packageId) {
        pkg = await storage.getUnifiedPackageById(order.packageId);
        if (!pkg) {
          const { resolvePackage } = await import("../../services/packages/package-resolver");
          pkg = await resolvePackage(order.packageId);
        }
        if (!pkg) {
          pkg = await storage.getPackageById(order.packageId);
        }
      }
    } catch (err) {
      logger.warn(`Failed to fetch package for order ${order.id}`, { error: err });
    }

    if (!pkg) {
      pkg = {
        id: order.packageId,
        title: order.dataAmount ? `${order.dataAmount} - ${order.validity} Days` : "eSIM Package",
        name: order.dataAmount ? `${order.dataAmount} - ${order.validity} Days` : "eSIM Package",
        dataAmount: order.dataAmount,
        validity: order.validity,
      };
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
      logger.warn(`Failed to fetch destination for order ${order.id}`, { error: err });
    }

    if (!destination) {
      destination = {
        name: "Global / Regional",
        countryCode: "GL",
      };
    }

    // Fetch provider name from database for dynamic display
    let providerName = "Unknown";
    if (order.providerId) {
      const provider = await db.query.providers.findFirst({
        where: eq(providers.id, order.providerId),
      });
      providerName = provider?.name || order.providerId;
    }

    // Use wholesalePrice if available, fallback to airaloPrice for legacy orders
    const providerCost = order.wholesalePrice || order.airaloPrice;

    return ApiResponse.success(res, "Order fetched successfully", {
      ...order,
      user: user || (order.guestEmail ? { email: order.guestEmail, name: "Guest" } : null),
      package: pkg ? { ...pkg, destination } : null,
      providerName,
      providerCost
    });
  })
);

router.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { status, iccid, qrCode, activationCode, smdpAddress } = req.body;

    const order = await storage.updateOrder(req.params.id, {
      status,
      iccid,
      qrCode,
      activationCode,
      smdpAddress,
    });

    if (!order) {
      return ApiResponse.notFound(res, "Order not found");
    }

    logger.info("Order updated by admin", {
      orderId: req.params.id,
      adminId: req.session.adminId,
      status,
    });

    return ApiResponse.success(res, "Order updated successfully", order);
  })
);

router.get(
  "/:id/refund-eligibility",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const eligibility = await refundService.checkEligibility(req.params.id);
    return ApiResponse.success(res, "Eligibility check completed", eligibility);
  })
);

router.post(
  "/:id/refund",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { reason = "CUSTOMER_REQUEST", notes, refundPayment = true } = req.body;

    const result = await refundService.processRefund({
      orderId: req.params.id,
      reason,
      notes,
      adminId: req.session.adminId,
      refundPayment,
    });

    // console.log("CHECK Result for refund@@@@@@@@", result)

    if (!result.success) {
      logger.warn("Refund failed", {
        orderId: req.params.id,
        adminId: req.session.adminId,
        error: result.errorMessage,
      });
      return ApiResponse.error(res, result.errorMessage || "Refund failed", 400);
    }

    logger.info("Order refunded by admin", {
      orderId: req.params.id,
      adminId: req.session.adminId,
      providerStatus: result.providerResult.status,
      paymentRefunded: result.paymentResult?.success,
      orderStatus: result.orderStatus,
    });

    return ApiResponse.success(res, "Order refunded successfully", {
      providerResult: result.providerResult,
      paymentResult: result.paymentResult,
      orderStatus: result.orderStatus,
    });
  })
);

router.post(
  "/:id/cancel",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { refundPayment = true } = req.body;

    const result = await refundService.processCancellation({
      orderId: req.params.id,
      adminId: req.session.adminId,
      refundPayment,
    });

    if (!result.success) {
      logger.warn("Cancellation failed", {
        orderId: req.params.id,
        adminId: req.session.adminId,
        error: result.errorMessage,
      });
      return ApiResponse.error(res, result.errorMessage || "Cancellation failed", 400);
    }

    logger.info("Order cancelled by admin", {
      orderId: req.params.id,
      adminId: req.session.adminId,
      providerStatus: result.providerResult.status,
      paymentRefunded: result.paymentResult?.success,
    });

    return ApiResponse.success(res, "Order cancelled successfully", {
      providerResult: result.providerResult,
      paymentResult: result.paymentResult,
      orderStatus: result.orderStatus,
    });
  })
);

export default router;
