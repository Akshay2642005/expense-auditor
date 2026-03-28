import { z } from "zod";

export const ZAuditDecisionStatus = z.enum(["approved", "flagged", "rejected"]);

export const ZAuditResponse = z.object({
  id: z.string().uuid(),
  claimId: z.string().uuid(),
  decision: ZAuditDecisionStatus,
  reason: z.string(),
  citedPolicyText: z.string().nullable().optional(),
  confidence: z.number(),
  aiModel: z.string(),
  deterministicRule: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type AuditDecisionStatus = z.infer<typeof ZAuditDecisionStatus>;
export type AuditResponse = z.infer<typeof ZAuditResponse>;
