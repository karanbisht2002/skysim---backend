"use strict";

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAdmin } from "../../lib/middleware";
import * as ApiResponse from "../../utils/response";

const router = Router();

router.get(
  "/stats",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const timeFilter = req.query.timeFilter as "7days" | "30days" | "lifetime";
    const stats = await storage.getStats(timeFilter);
    return ApiResponse.success(res, "Dashboard stats fetched successfully", stats);
  })
);

export default router;
