import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ZClaimResponse, ZSubmitClaimResponse } from "@auditor/zod";

const c = initContract();

const ZErrorResponse = z.object({
  message: z.string(),
});


export const claimContract = c.router({
  submitClaim: {
    summary: "Submit an expense claim",
    description: "Multipart form-data: file (JPG/PNG/PDF) + business_purpose + claimed_date + expense_category",
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
})
