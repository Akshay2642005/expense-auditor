import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  ZCreateOrganizationInvitationRequest,
  ZCreateOrganizationInvitationResponse,
} from "@auditor/zod";

const c = initContract();

const ZErrorResponse = z.object({
  message: z.string(),
});

export const organizationContract = c.router({
  createInvitation: {
    summary: "Create an organization invitation",
    method: "POST",
    path: "/v1/admin/organization/invitations",
    body: ZCreateOrganizationInvitationRequest,
    responses: {
      201: ZCreateOrganizationInvitationResponse,
      400: ZErrorResponse,
      401: ZErrorResponse,
      403: ZErrorResponse,
    },
  },
});
