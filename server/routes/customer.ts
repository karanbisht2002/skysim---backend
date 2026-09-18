"use strict";

import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { asyncHandler } from "../lib/asyncHandler";
import { ValidationError, NotFoundError } from "../lib/errors";
import { requireAuth } from "../lib/middleware";
import { profileImageUpload } from "../middleware/image-upload";
import { logger } from "../lib/logger";
import * as ApiResponse from "../utils/response";

const router = Router();

const uploadDir = path.join(process.cwd(), "uploads", "kyc");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});




router.post(
  "/kyc/upload",
  requireAuth,
  upload.single("document"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError("No file uploaded", "document");
    }

    const { documentType } = req.body;
    if (!documentType) {
      throw new ValidationError("Document type is required", "documentType");
    }

    // 👇 Use req.userId instead of req.session.userId
    const userId = req.userId!;

    console.log("Uploading KYC document for userId:", userId, req);

    const document = await storage.createKycDocument({
      userId,
      documentType,
      filePath: `uploads/kyc/${req.file.filename}`,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: "pending",
    });

    await storage.updateUser(userId, { kycStatus: "submitted" });

    // logger.info("KYC document uploaded", {
    //   userId,
    //   documentType,
    // });

    return ApiResponse.created(res, "KYC document uploaded successfully", { document });
  })
);



router.get(
  "/kyc/documents",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const documents = await storage.getKycDocumentsByUser(req.session.userId || req.userId!);

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

    return ApiResponse.success(res, "KYC documents fetched successfully", normalizedDocuments);
  })
);

router.get("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const user = await storage.getUser(userId);
    // console.log("USER FROM DB:", user);
    if (!user) {
      return ApiResponse.notFound(res, "User not found");
    }

    // console.log("USER BEFORE RESPONSE:", JSON.stringify(user));

    return ApiResponse.success(res, "Profile fetched successfully", user);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});


router.put(
  "/profile",
  requireAuth,
  profileImageUpload.single("profileImage"),
  async (req: Request, res: Response) => {
    try {
      const { name, phone, address, currency, destination } = req.body;
      const userId = req.userId!;

      const updateData: any = {
        name,
        phone,
        address,
        currency,
        destination,
      };

      // 👇 profile image aaye to update karo
      if (req.file) {
        const user = await storage.getUser(userId);

        // 🔥 old image delete
        if (user?.imagePath && fs.existsSync(user.imagePath)) {
          fs.unlinkSync(user.imagePath);
        }

        // ✅ DB field = imagePath
        updateData.imagePath = `uploads/profiles/${req.file.filename}`;
      }

      const updatedUser = await storage.updateUser(userId, updateData);

      const { logActivity, ActivityActions } = await import("../middleware/activity-logger");
      await logActivity(
        req,
        ActivityActions.PROFILE_UPDATED,
        "user",
        userId,
        { profileImageUpdated: !!req.file }
      );

      return ApiResponse.success(res, "Profile updated successfully", updatedUser);
    } catch (error: any) {
      return ApiResponse.serverError(res, error.message);
    }
  }
);



router.patch("/notification-preferences", requireAuth, async (req: Request, res: Response) => {
  try {
    const { notifyLowData, notifyExpiring } = req.body;

    if (typeof notifyLowData !== 'boolean' && typeof notifyExpiring !== 'boolean') {
      return ApiResponse.badRequest(res, "At least one notification preference must be provided");
    }

    const updateData: any = {};
    if (typeof notifyLowData === 'boolean') {
      updateData.notifyLowData = notifyLowData;
    }
    if (typeof notifyExpiring === 'boolean') {
      updateData.notifyExpiring = notifyExpiring;
    }

    const user = await storage.updateUser(req.session.userId!, updateData);

    const { logActivity, ActivityActions } = await import("../middleware/activity-logger");
    await logActivity(req, ActivityActions.PROFILE_UPDATED, 'user', req.session.userId!, {
      notificationPreferences: updateData
    });

    return ApiResponse.success(res, "Notification preferences updated successfully", user);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});


router.get("/orders", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return ApiResponse.unauthorized(res, "Unauthorized");
    }

    const orders = await storage.getOrdersByUser(userId);

    const { resolvePackage } = await import("../services/packages/package-resolver");
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
          console.warn(`[Customer Orders] Failed to resolve package for order ${order.id}:`, err);
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
          console.warn(`[Customer Orders] Failed to resolve destination for order ${order.id}:`, err);
        }

        return {
          ...order,
          package: pkg ? { ...pkg, destination } : null,
        };
      })
    );

    return ApiResponse.success(res, "Orders fetched successfully", ordersWithDetails);
  } catch (error: any) {
    console.error("[Customer Orders] Error fetching orders:", error);
    return ApiResponse.serverError(res, error.message);
  }
});


router.get("/my-esims-usages", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return ApiResponse.unauthorized(res, "Unauthorized");
    }

    // 1. Get all active eSIM orders for user
    const orders = await storage.getOrdersByStatus(userId, "completed");

    if (!orders || orders.length === 0) {
      return ApiResponse.notFound(res, "No eSIMs found");
    }

    const { providerFactory } = await import("../providers/provider-factory");

    // 2. Fetch usage for each eSIM
    const usageResults = await Promise.all(
      orders.map(async (order) => {
        try {
          if (!order.iccid) {
            return {
              orderId: order.id,
              iccid: null,
              status: "no_iccid",
            };
          }

          const providerService = await providerFactory.getServiceById(order.providerId);
          const usage = await providerService.getUsageData(order.iccid);

          return {
            orderId: order.id,
            iccid: order.iccid,
            providerId: order.providerId,
            packageId: order.packageId,
            usage,
          };
        } catch (err: any) {
          return {
            orderId: order.id,
            iccid: order.iccid,
            providerId: order.providerId,
            packageId: order.packageId,
            error: err.message,
          };
        }
      })
    );

    return ApiResponse.success(
      res,
      "eSIM usage fetched successfully",
      usageResults
    );
  } catch (error: any) {
    console.error("Error fetching eSIM usages:", error);
    return ApiResponse.serverError(res, error.message);
  }
});


router.get("/topups", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return ApiResponse.unauthorized(res, "Unauthorized");
    }
    const topups = await storage.getTopupsByUser(userId);
    return ApiResponse.success(res, "Topups fetched successfully", topups);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/activity", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return ApiResponse.unauthorized(res, "Unauthorized");
    }
    const logs = await storage.getActivityLogsByUser(userId);
    return ApiResponse.success(res, "Activity logs fetched successfully", logs);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/esims", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return ApiResponse.unauthorized(res, "Unauthorized");
    }

    const orders = await storage.getOrdersByUser(userId);
    const esims = orders.filter(order => order.iccid && order.status === "completed");

    return ApiResponse.success(res, "eSIMs fetched successfully", esims);
  } catch (error: any) {
    console.error("Error fetching customer eSIMs:", error);
    return ApiResponse.serverError(res, error.message);
  }
});

export default router;
