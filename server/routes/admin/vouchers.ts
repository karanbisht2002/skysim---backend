"use strict";

import { Router, Request, Response } from "express";
import { db } from "../../db";
import { voucherCodes, voucherUsage, orders, users } from "@shared/schema";
import { eq, desc, sql, and, gte, lte, count, sum } from "drizzle-orm";
import { requireAdmin } from "../../lib/middleware";
import { z } from "zod";

const router = Router();

const optionalNumber = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : val),
  z.coerce.number().positive().optional().nullable()
);

const optionalIntNumber = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : val),
  z.coerce.number().int().positive().optional().nullable()
);

// For required date fields - accept any date string and convert to ISO
const requiredDateString = z.string().min(1, "Date is required").transform((val) => {
  const date = new Date(val);
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date format");
  }
  return date.toISOString();
});

const createVoucherSchema = z.object({
  code: z.string().min(1).max(50),
  type: z.enum(["percentage", "fixed"]),
  value: z.coerce.number().positive(),
  description: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().optional()
  ),
  minPurchaseAmount: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? 0 : val),
    z.coerce.number().min(0)
  ),
  maxDiscountAmount: optionalNumber,
  maxUses: optionalIntNumber,
  perUserLimit: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? 1 : val),
    z.coerce.number().int().positive()
  ),
  validFrom: requiredDateString,
  validUntil: requiredDateString,
  targetCountries: z.array(z.string()).optional(),
  targetRegions: z.array(z.string()).optional(),
  targetPackages: z.array(z.string()).optional(),
  firstTimeOnly: z.preprocess(
    (val) => val === undefined ? undefined : (val === true || val === "true"),
    z.boolean().optional().default(false)
  ),
  isStackable: z.preprocess(
    (val) => val === undefined ? undefined : (val === true || val === "true"),
    z.boolean().optional().default(false)
  ),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

// Update schema without defaults - allows partial updates without overwriting existing values
const updateVoucherSchema = z.object({
  type: z.enum(["percentage", "fixed"]).optional(),
  value: z.coerce.number().positive().optional(),
  description: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().optional()
  ),
  minPurchaseAmount: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.coerce.number().min(0).optional()
  ),
  maxDiscountAmount: optionalNumber,
  maxUses: optionalIntNumber,
  perUserLimit: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.coerce.number().int().positive().optional()
  ),
  validFrom: z.string().min(1).transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error("Invalid date format");
    return date.toISOString();
  }).optional(),
  validUntil: z.string().min(1).transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error("Invalid date format");
    return date.toISOString();
  }).optional(),
  targetCountries: z.array(z.string()).optional(),
  targetRegions: z.array(z.string()).optional(),
  targetPackages: z.array(z.string()).optional(),
  firstTimeOnly: z.preprocess(
    (val) => val === undefined ? undefined : (val === true || val === "true"),
    z.boolean().optional()
  ),
  isStackable: z.preprocess(
    (val) => val === undefined ? undefined : (val === true || val === "true"),
    z.boolean().optional()
  ),
  status: z.enum(["active", "inactive"]).optional(),
});

router.get("/vouchers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const allVouchers = await db
      .select()
      .from(voucherCodes)
      .orderBy(desc(voucherCodes.createdAt));

    const activeCount = allVouchers.filter((v) => v.status === "active").length;

    const usageStats = await db
      .select({
        totalUsage: count(voucherUsage.id),
        totalDiscount: sum(voucherUsage.discountAmount),
      })
      .from(voucherUsage);

    res.json({
      success: true,
      vouchers: allVouchers,
      statistics: {
        totalVouchers: allVouchers.length,
        activeVouchers: activeCount,
        totalUsage: Number(usageStats[0]?.totalUsage || 0),
        totalDiscount: Number(usageStats[0]?.totalDiscount || 0),
      },
    });
  } catch (error) {
    console.error("Error fetching vouchers:", error);
    res.status(500).json({ success: false, message: "Failed to fetch vouchers" });
  }
});

router.get("/vouchers/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [voucher] = await db.select().from(voucherCodes).where(eq(voucherCodes.id, id));

    if (!voucher) {
      return res.status(404).json({ success: false, message: "Voucher not found" });
    }

    res.json({ success: true, voucher });
  } catch (error) {
    console.error("Error fetching voucher:", error);
    res.status(500).json({ success: false, message: "Failed to fetch voucher" });
  }
});

router.get("/vouchers/:id/usage", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const usage = await db
      .select({
        id: voucherUsage.id,
        voucherId: voucherUsage.voucherId,
        userId: voucherUsage.userId,
        orderId: voucherUsage.orderId,
        discountAmount: voucherUsage.discountAmount,
        usedAt: voucherUsage.usedAt,
      })
      .from(voucherUsage)
      .where(eq(voucherUsage.voucherId, id))
      .orderBy(desc(voucherUsage.usedAt));

    res.json({ success: true, usage });
  } catch (error) {
    console.error("Error fetching voucher usage:", error);
    res.status(500).json({ success: false, message: "Failed to fetch voucher usage" });
  }
});

router.post("/vouchers", requireAdmin, async (req: Request, res: Response) => {
  try {
    console.log("[Voucher Create] Request body:", JSON.stringify(req.body, null, 2));
    const parsed = createVoucherSchema.parse(req.body);
    console.log("[Voucher Create] Parsed data:", JSON.stringify(parsed, null, 2));
    const adminId = (req as any).admin?.id;

    const validFrom = new Date(parsed.validFrom);
    const validUntil = new Date(parsed.validUntil);
    if (validUntil <= validFrom) {
      return res.status(400).json({ success: false, message: "End date must be after start date" });
    }

    if (parsed.maxUses && parsed.perUserLimit && parsed.perUserLimit > parsed.maxUses) {
      return res.status(400).json({ success: false, message: "Per-user limit cannot exceed total uses limit" });
    }

    const existing = await db
      .select()
      .from(voucherCodes)
      .where(eq(voucherCodes.code, parsed.code.toUpperCase()));

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "Voucher code already exists" });
    }

    const [voucher] = await db
      .insert(voucherCodes)
      .values({
        code: parsed.code.toUpperCase(),
        type: parsed.type,
        value: parsed.value.toString(),
        description: parsed.description,
        minPurchaseAmount: parsed.minPurchaseAmount?.toString() || "0",
        maxDiscountAmount: parsed.maxDiscountAmount?.toString() || null,
        maxUses: parsed.maxUses,
        perUserLimit: parsed.perUserLimit,
        validFrom: new Date(parsed.validFrom),
        validUntil: new Date(parsed.validUntil),
        targetCountries: parsed.targetCountries,
        targetRegions: parsed.targetRegions,
        targetPackages: parsed.targetPackages,
        firstTimeOnly: parsed.firstTimeOnly,
        isStackable: parsed.isStackable,
        status: parsed.status,
        createdBy: adminId,
      })
      .returning();

    res.status(201).json({ success: true, message: "Voucher created", voucher });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: "Validation error", errors: error.errors });
    }
    console.error("Error creating voucher:", error);
    res.status(500).json({ success: false, message: "Failed to create voucher" });
  }
});

router.patch("/vouchers/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateVoucherSchema.parse(req.body);

    const [existing] = await db.select().from(voucherCodes).where(eq(voucherCodes.id, id));
    if (!existing) {
      return res.status(404).json({ success: false, message: "Voucher not found" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (parsed.type !== undefined) updateData.type = parsed.type;
    if (parsed.value !== undefined) updateData.value = parsed.value.toString();
    if (parsed.description !== undefined) updateData.description = parsed.description;
    if (parsed.minPurchaseAmount !== undefined) updateData.minPurchaseAmount = parsed.minPurchaseAmount.toString();
    if (parsed.maxDiscountAmount !== undefined) updateData.maxDiscountAmount = parsed.maxDiscountAmount?.toString() || null;
    if (parsed.maxUses !== undefined) updateData.maxUses = parsed.maxUses;
    if (parsed.perUserLimit !== undefined) updateData.perUserLimit = parsed.perUserLimit;
    if (parsed.validFrom !== undefined) updateData.validFrom = new Date(parsed.validFrom);
    if (parsed.validUntil !== undefined) updateData.validUntil = new Date(parsed.validUntil);
    if (parsed.targetCountries !== undefined) updateData.targetCountries = parsed.targetCountries;
    if (parsed.targetRegions !== undefined) updateData.targetRegions = parsed.targetRegions;
    if (parsed.targetPackages !== undefined) updateData.targetPackages = parsed.targetPackages;
    if (parsed.firstTimeOnly !== undefined) updateData.firstTimeOnly = parsed.firstTimeOnly;
    if (parsed.isStackable !== undefined) updateData.isStackable = parsed.isStackable;
    if (parsed.status !== undefined) updateData.status = parsed.status;

    const [voucher] = await db
      .update(voucherCodes)
      .set(updateData)
      .where(eq(voucherCodes.id, id))
      .returning();

    res.json({ success: true, message: "Voucher updated", voucher });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: "Validation error", errors: error.errors });
    }
    console.error("Error updating voucher:", error);
    res.status(500).json({ success: false, message: "Failed to update voucher" });
  }
});

router.delete("/vouchers/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing] = await db.select().from(voucherCodes).where(eq(voucherCodes.id, id));
    if (!existing) {
      return res.status(404).json({ success: false, message: "Voucher not found" });
    }

    await db.transaction(async (tx) => {
      await tx.delete(voucherUsage).where(eq(voucherUsage.voucherId, id));
      await tx.delete(voucherCodes).where(eq(voucherCodes.id, id));
    });

    res.json({ success: true, message: "Voucher deleted" });
  } catch (error) {
    console.error("Error deleting voucher:", error);
    res.status(500).json({ success: false, message: "Failed to delete voucher" });
  }
});

export default router;
