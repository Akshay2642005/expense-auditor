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

export const ZUpdateOrganizationMembershipRoleRequest = z.object({
  role: ZOrganizationRole,
});
export type UpdateOrganizationMembershipRoleRequest = z.infer<
  typeof ZUpdateOrganizationMembershipRoleRequest
>;

export const ZUpdateOrganizationMembershipRoleResponse = z.object({
  userId: z.string(),
  role: ZOrganizationRole,
});
export type UpdateOrganizationMembershipRoleResponse = z.infer<
  typeof ZUpdateOrganizationMembershipRoleResponse
>;
