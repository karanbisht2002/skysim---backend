"use strict";

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { asyncHandler } from "../../lib/asyncHandler";
import { NotFoundError } from "../../lib/errors";
import { requireAdmin } from "../../lib/middleware";
import { logger } from "../../lib/logger";
import * as ApiResponse from "../../utils/response";

const router = Router();

router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = req.query.search as string | undefined;
    const kycStatus = req.query.kycStatus as string | undefined;
    const status = req.query.status as string | undefined;

    const customers = await storage.getUsersWithPagination(
      page,
      limit,
      search,
      kycStatus,
      status
    );

    return ApiResponse.success(
      res,
      "Customers fetched successfully",
      customers
    );
  })
);



router.get(
  "/:id",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await storage.getUserWithDetails(req.params.id);
    if (!user) {
      return ApiResponse.notFound(res, "Customer not found");
    }
    return ApiResponse.success(res, "Customer fetched successfully", user);
  })
);

router.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, phone, address, kycStatus, isBlocked } = req.body;
    const user = await storage.updateUser(req.params.id, {
      name,
      email,
      phone,
      address,
      kycStatus,
      isBlocked,
    });

    if (!user) {
      return ApiResponse.notFound(res, "Customer not found");
    }

    logger.info("Customer updated by admin", {
      customerId: req.params.id,
      adminId: req.session.adminId,
    });

    return ApiResponse.success(res, "Customer updated successfully", user);
  })
);

router.get(
  "/:id/orders",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const orders = await storage.getOrdersByUser(req.params.id);
    return ApiResponse.success(res, "Customer orders fetched successfully", orders);
  })
);

router.get(
  "/:id/activity",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const activities = await storage.getActivityLogsByUser(req.params.id);
    return ApiResponse.success(res, "Customer activity fetched successfully", activities);
  })
);

export default router;
