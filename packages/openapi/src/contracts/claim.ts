import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  ZAdminClaimListQuery,
  ZAdminClaimDetailResponse,
  ZAdminClaimOverrideRequest,
  ZClaimResponse,
  ZSubmitClaimResponse,
} from "@auditor/zod";

const c = initContract();

const ZErrorResponse = z.object({
  message: z.string(),
});

export const claimContract = c.router({
  submitClaim: {
    summary: "Submit an expense claim",
    description:
      "Multipart form-data: file (JPG/PNG/PDF) + business_purpose + claimed_date + expense_category",
    method: "POST",
    path: "/v1/claims",
    // Multipart upload — use FormData on the client side via axios directly
    body: c.type<FormData>(),
    responses: {
      202: ZSubmitClaimResponse,
      400: ZErrorResponse,
      401: ZErrorResponse,
    },
  },
  listClaims: {
    summary: "List all claims for the authenticated user",
    method: "GET",
    path: "/v1/claims",
    responses: {
      200: z.array(ZClaimResponse),
      401: ZErrorResponse,
    },
  },
  listAdminClaims: {
    summary: "List admin review claims with search, filters, and sorting",
    method: "GET",
    path: "/v1/admin/claims",
    query: ZAdminClaimListQuery,
    responses: {
      200: z.array(ZClaimResponse),
      401: ZErrorResponse,
      403: ZErrorResponse,
    },
  },

  getClaim: {
    summary: "Get a single claim by ID",
    method: "GET",
    path: "/v1/claims/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: ZClaimResponse,
      401: ZErrorResponse,
      403: ZErrorResponse,
      404: ZErrorResponse,
    },
  },

  getAdminClaim: {
    summary: "Get admin review detail for a single claim",
    method: "GET",
    path: "/v1/admin/claims/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: ZAdminClaimDetailResponse,
      401: ZErrorResponse,
      403: ZErrorResponse,
      404: ZErrorResponse,
    },
  },

  overrideAdminClaim: {
    summary: "Override the current admin review decision for a claim",
    method: "PATCH",
    path: "/v1/admin/claims/:id/override",
    pathParams: z.object({ id: z.string().uuid() }),
    body: ZAdminClaimOverrideRequest,
    responses: {
      200: ZAdminClaimDetailResponse,
      400: ZErrorResponse,
      401: ZErrorResponse,
      403: ZErrorResponse,
      404: ZErrorResponse,
    },
  },

  recomputePolicy: {
    summary: "Recompute policy matching for a claim",
    method: "POST",
    path: "/v1/admin/claims/:id/recompute-policy",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}).optional(),
    responses: {
      200: ZClaimResponse,
      401: ZErrorResponse,
      403: ZErrorResponse,
      404: ZErrorResponse,
    },
  },
});
