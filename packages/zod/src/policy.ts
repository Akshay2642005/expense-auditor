import { z } from "zod";

export const ZPolicyStatus = z.enum([
  "pending",
  "ingesting",
  "active",
  "failed",
  "archived",
]);
export type PolicyStatus = z.infer<typeof ZPolicyStatus>;

export const ZPolicy = z.object({
  id: z.string().uuid(),
  name: z.string(),
  gcsPath: z.string(),
  version: z.string(),
  status: ZPolicyStatus,
  chunkCount: z.number().int(),
  uploadedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Policy = z.infer<typeof ZPolicy>;

export const ZUploadPolicyResponse = ZPolicy;
export type UploadPolicyResponse = Policy;

export const ZListPoliciesResponse = z.array(ZPolicy);
export type ListPoliciesResponse = z.infer<typeof ZListPoliciesResponse>;
