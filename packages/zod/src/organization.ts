import { z } from "zod";

export const ZOrganizationRole = z.enum(["org:member", "org:admin"]);
export type OrganizationRole = z.infer<typeof ZOrganizationRole>;

export const ZCreateOrganizationInvitationRequest = z.object({
  emailAddress: z.string().email(),
  role: ZOrganizationRole.optional(),
});
export type CreateOrganizationInvitationRequest = z.infer<
  typeof ZCreateOrganizationInvitationRequest
>;

export const ZCreateOrganizationInvitationResponse = z.object({
  id: z.string(),
  emailAddress: z.string().email(),
  role: z.string(),
  status: z.string(),
  redirectUrl: z.string(),
});
export type CreateOrganizationInvitationResponse = z.infer<
  typeof ZCreateOrganizationInvitationResponse
>;
