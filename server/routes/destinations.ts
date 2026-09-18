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
    const destinations = await storage.getAllDestinations();
    return ApiResponse.success(res, "Destinations fetched successfully", destinations);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/with-pricing", async (req: Request, res: Response) => {
  try {
    const requestedCurrency = (req.query.currency as string) || "USD";
    const destinations = await storage.getDestinationsWithPricing();

    const currencyRates = await storage.getCurrencies();
    const targetRate = parseFloat(currencyRates.find(c => c.code.toUpperCase() === requestedCurrency.toUpperCase())?.conversionRate || "1");

    const convertedDestinations = destinations.map(dest => ({
      ...dest,
      minPrice: (parseFloat(dest.minPrice) * targetRate).toFixed(2),
      currency: requestedCurrency
    }));

    return ApiResponse.success(res, "Destinations with pricing fetched successfully", convertedDestinations);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/slug/:slug", async (req: Request, res: Response) => {
  try {
    const destination = await storage.getDestinationBySlug(req.params.slug);
    if (!destination) {
      return ApiResponse.notFound(res, "Destination not found");
    }
    return ApiResponse.success(res, "Destination fetched successfully", destination);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

export default router;
