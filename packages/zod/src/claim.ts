import { z } from "zod";

export const ZClaimStatus = z.enum([
  "pending",
  "processing",
  "ocr_complete",
  "needs_review",
  "ocr_failed",
  "auditing",
  "approved",
  "flagged",
  "rejected",
]);

export const ZExpenseCategory = z.enum([
  "meals",
  "transport",
  "lodging",
  "other",
]);

export const ZSubmitClaimResponse = z.object({
  claimId: z.string().uuid(),
  status: ZClaimStatus,
  message: z.string(),
});

export const ZClaimResponse = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  receiptFileId: z.string().uuid(),
  businessPurpose: z.string(),
  claimedDate: z.string(),
  expenseCategory: ZExpenseCategory,
  status: ZClaimStatus,
  merchantName: z.string().nullable().optional(),
  receiptDate: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  dateMismatch: z.boolean(),
  ocrError: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ClaimStatus = z.infer<typeof ZClaimStatus>;
export type ExpenseCategory = z.infer<typeof ZExpenseCategory>;
export type SubmitClaimResponse = z.infer<typeof ZSubmitClaimResponse>;
export type ClaimResponse = z.infer<typeof ZClaimResponse>;
