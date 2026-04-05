import { z } from "zod";
import { ZAuditResponse } from "./audit.js";

export const ZClaimStatus = z.enum([
  "pending",
  "processing",
  "ocr_complete",
  "needs_review",
  "ocr_failed",
  "policy_matched",
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

export const ZAdminClaimFlagFilter = z.enum(["all", "flagged", "unflagged"]);

export const ZAdminClaimDateField = z.enum(["submitted", "claimed"]);

export const ZAdminClaimSortBy = z.enum([
  "submittedDate",
  "claimedDate",
  "amount",
  "status",
  "merchant",
]);

export const ZAdminClaimSortDir = z.enum(["asc", "desc"]);

export const ZAdminClaimListQuery = z.object({
  q: z.string().optional(),
  statuses: z.string().optional(),
  uploaderUserId: z.string().optional(),
  flagged: ZAdminClaimFlagFilter.optional(),
  dateField: ZAdminClaimDateField.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: ZAdminClaimSortBy.optional(),
  sortDir: ZAdminClaimSortDir.optional(),
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

export const ZAdminClaimPolicyChunkResponse = z.object({
  chunkText: z.string(),
  category: z.string(),
  pageNum: z.number().int(),
  score: z.number(),
});

export const ZAdminClaimDetailResponse = z.object({
  claim: ZClaimResponse,
  audit: ZAuditResponse.nullable(),
  auditHistory: z.array(ZAuditResponse),
  policyId: z.string().uuid().nullable(),
  policyChunks: z.array(ZAdminClaimPolicyChunkResponse),
});

export type ClaimStatus = z.infer<typeof ZClaimStatus>;
export type ExpenseCategory = z.infer<typeof ZExpenseCategory>;
export type SubmitClaimResponse = z.infer<typeof ZSubmitClaimResponse>;
export type ClaimResponse = z.infer<typeof ZClaimResponse>;
export type AdminClaimPolicyChunkResponse = z.infer<
  typeof ZAdminClaimPolicyChunkResponse
>;
export type AdminClaimDetailResponse = z.infer<
  typeof ZAdminClaimDetailResponse
>;
export type AdminClaimFlagFilter = z.infer<typeof ZAdminClaimFlagFilter>;
export type AdminClaimDateField = z.infer<typeof ZAdminClaimDateField>;
export type AdminClaimSortBy = z.infer<typeof ZAdminClaimSortBy>;
export type AdminClaimSortDir = z.infer<typeof ZAdminClaimSortDir>;
export type AdminClaimListQuery = z.infer<typeof ZAdminClaimListQuery>;
