"use strict";

import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/asyncHandler";
import { NotFoundError } from "../lib/errors";
import * as ApiResponse from "../utils/response";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'public, max-age=600');
    const regions = await storage.getAllRegions();
    return ApiResponse.success(res, "Regions fetched successfully", regions);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/with-pricing", async (req: Request, res: Response) => {
  try {
    const requestedCurrency = (req.query.currency as string) || "USD";
    const regions = await storage.getRegionsWithPricing();

    const currencyRates = await storage.getCurrencies();
    const targetRate = parseFloat(currencyRates.find(c => c.code.toUpperCase() === requestedCurrency.toUpperCase())?.conversionRate || "1");

    const convertedRegions = regions.map(region => ({
      ...region,
      minPrice: (parseFloat(region.minPrice) * targetRate).toFixed(2),
      currency: requestedCurrency
    }));

    return ApiResponse.success(res, "Regions with pricing fetched successfully", convertedRegions);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/slug/:slug", async (req: Request, res: Response) => {
  try {
    const region = await storage.getRegionBySlug(req.params.slug);
    if (!region) {
      return ApiResponse.notFound(res, "Region not found");
    }
    return ApiResponse.success(res, "Region fetched successfully", region);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

export default router;
