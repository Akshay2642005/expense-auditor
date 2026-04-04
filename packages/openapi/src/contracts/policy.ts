import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ZPolicy, ZListPoliciesResponse } from "@auditor/zod";

const c = initContract();

export const policyContract = c.router({
  getActivePolicy: {
    method: "GET",
    path: "/v1/policy/active",
    responses: {
      200: ZPolicy.nullable(),
      401: z.object({ message: z.string() }),
    },
    summary: "Get the active policy for the authenticated organization member",
  },

  uploadPolicy: {
    method: "POST",
    path: "/v1/admin/policy",
    contentType: "multipart/form-data",
    body: c.type<FormData>(),
    responses: {
      202: ZPolicy,
      400: z.object({ message: z.string() }),
      403: z.object({ message: z.string() }),
      422: z.object({ message: z.string() }),
    },
    summary: "Upload a new expense policy PDF (org:admin only)",
  },

  listPolicies: {
    method: "GET",
    path: "/v1/admin/policy",
    responses: {
      200: ZListPoliciesResponse,
      401: z.object({ message: z.string() }),
      403: z.object({ message: z.string() }),
    },
    summary: "List all policies (org:admin only)",
  },

  getPolicy: {
    method: "GET",
    path: "/v1/admin/policy/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: ZPolicy,
      401: z.object({ message: z.string() }),
      403: z.object({ message: z.string() }),
      404: z.object({ message: z.string() }),
    },
    summary: "Get a policy by ID (org:admin only)",
  },
});
