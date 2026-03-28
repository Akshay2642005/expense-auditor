import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ZAuditResponse } from "@auditor/zod";

const c = initContract();

const ZErrorResponse = z.object({ message: z.string() });

export const auditContract = c.router({
  getAuditResult: {
    summary: "Get audit result for a claim",
    method: "GET",
    path: "/v1/claims/:id/audit",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: ZAuditResponse,
      401: ZErrorResponse,
      403: ZErrorResponse,
      404: ZErrorResponse,
    },
  },
});
