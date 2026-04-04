import { z } from "zod";

export const ZAuditDecisionStatus = z.enum(["approved", "flagged", "rejected"]);

export const ZAdminClaimOverrideRequest = z.object({
  decision: ZAuditDecisionStatus,
  reason: z.string().trim().min(10).max(1000),
});

export const ZAuditResponse = z.object({
  id: z.string().uuid(),
  claimId: z.string().uuid(),
  decision: ZAuditDecisionStatus,
  reason: z.string(),
  citedPolicyText: z.string().nullable().optional(),
  confidence: z.number(),
  aiModel: z.string(),
  deterministicRule: z.string().nullable().optional(),
  overriddenBy: z.string().nullable().optional(),
  overrideReason: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type AuditDecisionStatus = z.infer<typeof ZAuditDecisionStatus>;
export type AdminClaimOverrideRequest = z.infer<
  typeof ZAdminClaimOverrideRequest
>;
export type AuditResponse = z.infer<typeof ZAuditResponse>;
