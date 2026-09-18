"use strict";

import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/asyncHandler";
import { NotFoundError } from "../lib/errors";
import { db } from "../db";
import { orders, providers, unifiedPackages, reviews, users, insertReviewSchema, referralProgram, referrals, referralSettings, insertReferralProgramSchema, insertReferralSchema, insertReferralSettingsSchema, blogPosts, regions } from "@shared/schema";
import { eq, and, desc, sql, or, isNull, gt } from "drizzle-orm";
import * as ApiResponse from "../utils/response";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const packages = await storage.getAllPackages();

    const marginSetting = await storage.getSettingByKey("pricing_margin");
    const marginPercent = marginSetting ? parseFloat(marginSetting.value) : 0;

    const packagesWithDestinations = await Promise.all(
      packages.map(async (pkg) => {
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
      })
    );

    return ApiResponse.success(res, "Packages fetched successfully", packagesWithDestinations);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/featured", async (req: Request, res: Response) => {
  try {
    const packages = await storage.getFeaturedPackages();

    const packagesWithDestinations = await Promise.all(
      packages.map(async (pkg) => {
        let destination = null;
        let region = null;
        if (pkg.destinationId) {
          destination = await storage.getDestinationById(pkg.destinationId);
        }
        if (pkg.regionId) {
          region = await storage.getRegionById(pkg.regionId);
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
          region: region
            ? {
              id: region.id,
              name: region.name,
              slug: region.slug,
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

router.get("/complete", async (req: Request, res: Response) => {
  try {
    // Get packages that have all 3 features: Data, Voice, and SMS
    const completePackages = await db.query.unifiedPackages.findMany({
      where: and(
        eq(unifiedPackages.isEnabled, true),
        sql`${unifiedPackages.voiceMinutes} > 0`,
        sql`${unifiedPackages.smsCount} > 0`,
        sql`${unifiedPackages.dataMb} > 0`
      ),
      orderBy: [desc(unifiedPackages.salesCount)],
      limit: 8,
    });

    const packagesWithDestinations = await Promise.all(
      completePackages.map(async (pkg) => {
        let destination = null;
        if (pkg.destinationId) {
          destination = await storage.getDestinationById(pkg.destinationId);
        }
        return {
          id: pkg.id,
          title: pkg.title,
          slug: pkg.slug,
          dataAmount: pkg.dataAmount,
          validity: pkg.validity,
          retailPrice: pkg.retailPrice,
          voiceMinutes: pkg.voiceMinutes,
          smsCount: pkg.smsCount,
          destinationId: pkg.destinationId,
          regionId: pkg.regionId,
          destination,
        };
      })
    );

    return ApiResponse.success(res, "Complete packages fetched successfully", packagesWithDestinations);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/global-old", async (req: Request, res: Response) => {
  try {
    const globalRegion = await db.query.regions.findFirst({
      where: sql`LOWER(name) = 'global'`,
    });

    if (!globalRegion) {
      return ApiResponse.success(res, "Global packages fetched successfully", []);
    }

    const globalPackages = await db.query.unifiedPackages.findMany({
      where: and(
        eq(unifiedPackages.regionId, globalRegion.id),
        eq(unifiedPackages.isEnabled, true)
      ),
      limit: 12,
      orderBy: [desc(unifiedPackages.salesCount)],
    });

    const formattedPackages = globalPackages.map(pkg => ({
      id: pkg.id,
      title: pkg.title,
      dataAmount: pkg.dataAmount,
      validity: pkg.validity,
      retailPrice: pkg.retailPrice,
      slug: pkg.slug,
    }));

    return ApiResponse.success(res, "Global packages fetched successfully", formattedPackages);
  } catch (error: any) {
    console.error("Error fetching global packages:", error);
    return ApiResponse.serverError(res, error.message);
  }
});




router.get("/global", async (req: Request, res: Response) => {
  try {
    const requestedCurrency = (req.query.currency as string) || "USD";
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const filterUnlimited = req.query.isUnlimited === "true";
    const filterBestPrice = req.query.isBestPrice === "true";
    const filterPopular = req.query.isPopular === "true";

    const filterDataPack = req.query.dataPack === "true";
    const filterVoiceAndDataPack = req.query.voiceAndDataPack === "true";
    const filterVoiceAndDataAndSmsPack = req.query.voiceAndDataAndSmsPack === "true";

    const globalRegion = await db.query.regions.findFirst({
      where: eq(regions.slug, "world"),
    });

    const whereClauses: any[] = [
      eq(unifiedPackages.isEnabled, true),
      // Must be global type or linked to world region
      or(
        eq(unifiedPackages.type, "global"),
        globalRegion ? eq(unifiedPackages.regionId, globalRegion.id) : sql`FALSE`
      ),
      // If a region is specified, it MUST be the world region (excludes mislabeled regional packs)
      globalRegion
        ? or(isNull(unifiedPackages.regionId), eq(unifiedPackages.regionId, globalRegion.id))
        : isNull(unifiedPackages.regionId)
    ];

    if (filterUnlimited) whereClauses.push(eq(unifiedPackages.isUnlimited, true));
    if (filterBestPrice) whereClauses.push(eq(unifiedPackages.isBestPrice, true));
    if (filterPopular) whereClauses.push(eq(unifiedPackages.isPopular, true));

    if (filterDataPack) {
      whereClauses.push(and(eq(unifiedPackages.voiceMinutes, 0), eq(unifiedPackages.smsCount, 0)));
    }
    if (filterVoiceAndDataPack) {
      whereClauses.push(and(gt(unifiedPackages.voiceMinutes, 0), eq(unifiedPackages.smsCount, 0)));
    }
    if (filterVoiceAndDataAndSmsPack) {
      whereClauses.push(and(gt(unifiedPackages.voiceMinutes, 0), gt(unifiedPackages.smsCount, 0)));
    }

    const allPackages = await db.query.unifiedPackages.findMany({
      where: and(...whereClauses),
      with: {
        provider: true,
      },
    });

    const currencies = await storage.getCurrencies();
    const fromCurrency = currencies.find((c) => c.code === "USD");
    const toCurrency = currencies.find((c) => c.code === requestedCurrency);

    // Group and deduplicate packages by dataAmount and validity
    const groupedMap = new Map<string, any>();

    for (const pkg of allPackages) {
      const provider = pkg.provider;
      if (!provider || !provider.enabled) continue;

      const wholesalePrice = parseFloat(pkg.wholesalePrice);
      const providerMargin = parseFloat(provider.pricingMargin);
      let retailPrice = wholesalePrice * (1 + providerMargin / 100);

      if (requestedCurrency !== "USD" && fromCurrency && toCurrency) {
        const fromRate = parseFloat(fromCurrency.conversionRate);
        const toRate = parseFloat(toCurrency.conversionRate);
        retailPrice = (retailPrice / fromRate) * toRate;
      }

      const formattedPkg = {
        id: pkg.id,
        title: pkg.title,
        slug: pkg.slug,
        dataAmount: pkg.dataAmount,
        dataMb: pkg.dataMb,
        validity: pkg.validity,
        validityDays: pkg.validityDays,
        price: retailPrice.toFixed(2),
        currency: requestedCurrency,
        isUnlimited: pkg.isUnlimited,
        isBestPrice: pkg.isBestPrice,
        isPopular: pkg.isPopular,
        isRecommended: pkg.isRecommended,
        isBestValue: pkg.isBestValue,
        providerId: pkg.providerId,
        providerName: provider.name,
        providerSlug: provider.slug,
        operator: pkg.operator,
        operatorImage: pkg.operatorImage,
        voiceMinutes: pkg.voiceMinutes,
        smsCount: pkg.smsCount,
        coverage: pkg.coverage,
      };

      const groupKey = `${pkg.dataAmount}-${pkg.validity}`;
      const existing = groupedMap.get(groupKey);

      // Deduplication logic: pick the one with better price or badges
      if (!existing || parseFloat(formattedPkg.price) < parseFloat(existing.price)) {
        groupedMap.set(groupKey, formattedPkg);
      } else if (parseFloat(formattedPkg.price) === parseFloat(existing.price)) {
        // Tie-breaker: pick the one with more badges
        const existingBadges = (existing.isPopular ? 1 : 0) + (existing.isRecommended ? 1 : 0) + (existing.isBestValue ? 1 : 0);
        const currentBadges = (formattedPkg.isPopular ? 1 : 0) + (formattedPkg.isRecommended ? 1 : 0) + (formattedPkg.isBestValue ? 1 : 0);
        if (currentBadges > existingBadges) {
          groupedMap.set(groupKey, formattedPkg);
        }
      }
    }

    const uniquePackages = Array.from(groupedMap.values());

    // Sort: Data amount ascending, then validity ascending
    uniquePackages.sort((a, b) => {
      if (a.dataMb !== b.dataMb) return (a.dataMb || 0) - (b.dataMb || 0);
      return (a.validityDays || 0) - (b.validityDays || 0);
    });

    const total = uniquePackages.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedPackages = uniquePackages.slice((page - 1) * limit, page * limit);

    return ApiResponse.successWithPagination(res, "Global packages fetched successfully", paginatedPackages, {
      page,
      limit,
      total,
      totalPages,
    });
  } catch (error: any) {
    console.error("Error fetching global packages:", error);
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const packagesResult = await db.execute(sql`SELECT COUNT(*) as count FROM unified_packages WHERE is_enabled = true`);
    const destinationsResult = await db.execute(sql`SELECT COUNT(*) as count FROM destinations WHERE active = true`);

    const totalPackages = Number(packagesResult.rows[0]?.count) || 0;
    const totalDestinations = Number(destinationsResult.rows[0]?.count) || 0;

    return ApiResponse.success(res, "Package stats fetched successfully", {
      totalPackages,
      totalDestinations,
    });
  } catch (error: any) {
    console.error("Error fetching package stats:", error);
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/slug/:slug", async (req: Request, res: Response) => {
  try {
    const pkg = await storage.getPackageBySlug(req.params.slug);
    if (!pkg) {
      return ApiResponse.notFound(res, "Package not found");
    }

    let destination;
    if (pkg.destinationId) {
      destination = await storage.getDestinationById(pkg.destinationId);
    }

    return ApiResponse.success(res, "Package fetched successfully", { ...pkg, destination });
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const pkg = await storage.getPackageById(req.params.id);
    if (!pkg) {
      return ApiResponse.notFound(res, "Package not found");
    }

    let destination;
    if (pkg.destinationId) {
      destination = await storage.getDestinationById(pkg.destinationId);
    }

    return ApiResponse.success(res, "Package fetched successfully", { ...pkg, destination });
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/:packageId/reviews", async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const { rating, page = "1" } = req.query;
    const limit = 20;
    const offset = (parseInt(page as string) - 1) * limit;

    let whereConditions: any[] = [
      eq(reviews.packageId, packageId),
      eq(reviews.isApproved, true),
    ];

    if (rating) {
      whereConditions.push(eq(reviews.rating, parseInt(rating as string)));
    }

    const reviewsData = await db.query.reviews.findMany({
      where: and(...whereConditions),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      limit,
      offset,
      orderBy: [desc(reviews.createdAt)],
    });

    const total = await db.select({ count: sql<number>`count(*)` })
      .from(reviews)
      .where(and(...whereConditions));

    return ApiResponse.successWithPagination(
      res,
      "Reviews fetched successfully",
      { reviews: reviewsData },
      {
        page: parseInt(page as string),
        limit,
        total: total[0]?.count || 0,
      }
    );
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get("/:packageId/review-stats", async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;

    const stats = await db.select({
      rating: reviews.rating,
      count: sql<number>`count(*)`,
    })
      .from(reviews)
      .where(and(
        eq(reviews.packageId, packageId),
        eq(reviews.isApproved, true)
      ))
      .groupBy(reviews.rating);

    const total = stats.reduce((acc, s) => acc + s.count, 0);
    const average = total > 0
      ? stats.reduce((acc, s) => acc + (s.rating * s.count), 0) / total
      : 0;

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    stats.forEach(s => {
      distribution[s.rating] = s.count;
    });

    return ApiResponse.success(res, "Review stats fetched successfully", {
      average: Math.round(average * 10) / 10,
      total,
      distribution,
    });
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

export default router;