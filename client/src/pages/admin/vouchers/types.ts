import * as z from "zod";

export const voucherSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1),
  type: z.string().min(1),
  value: z.string().min(1),
  minPurchaseAmount: z.string().optional(),
  maxUses: z
    .string()
    .optional()
    .transform((val) => (val === "" ? null : Number(val))),
  validFrom: z
    .string()
    .min(1, "Valid From date is required")
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format",
    }),
  validUntil: z
    .string()
    .min(1, "Valid Until date is required")
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format",
    }),
  description: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]),
});

export type VoucherFormData = z.infer<typeof voucherSchema>;


export interface Voucher {
  id: string;
  code: string;
  type: string;
  value: string;
  minPurchaseAmount: string;
  maxUses: number | null;
  currentUses: number;
  validFrom: string;
  validUntil: string;
  description: string | null;
  status: "active" | "inactive";
}
