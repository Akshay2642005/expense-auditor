import type {
  AdminClaimDateField,
  AdminClaimFlagFilter,
  AdminClaimSortBy,
  AdminClaimSortDir,
  ClaimResponse,
  ClaimStatus,
  SubmitClaimResponse,
} from "@auditor/zod";
import { useCallback, useMemo } from "react";
import { getApiErrorMessage, useApiClient } from "@/api/index";

export interface SubmitClaimPayload {
  file: File;
  businessPurpose: string;
  claimedDate: string; // YYYY-MM-DD
  expenseCategory: "meals" | "transport" | "lodging" | "other";
}

export type SubmitClaimResult = SubmitClaimResponse;

export interface AdminClaimsQuery {
  q?: string;
  statuses?: ClaimStatus[];
  uploaderUserId?: string;
  flagged?: AdminClaimFlagFilter;
  dateField?: AdminClaimDateField;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: AdminClaimSortBy;
  sortDir?: AdminClaimSortDir;
}

export function useClaimsApi() {
  const api = useApiClient();

  const toAdminClaimsQuery = useCallback(
    (query?: AdminClaimsQuery) => ({
      q: query?.q,
      statuses: query?.statuses?.length ? query.statuses.join(",") : undefined,
      uploaderUserId: query?.uploaderUserId,
      flagged: query?.flagged && query.flagged !== "all" ? query.flagged : undefined,
      dateField: query?.dateField && query.dateField !== "submitted" ? query.dateField : undefined,
      dateFrom: query?.dateFrom,
      dateTo: query?.dateTo,
      sortBy: query?.sortBy && query.sortBy !== "submittedDate" ? query.sortBy : undefined,
      sortDir: query?.sortDir && query.sortDir !== "desc" ? query.sortDir : undefined,
    }),
    [],
  );

  const submitClaim = useCallback(async (
    payload: SubmitClaimPayload,
  ): Promise<SubmitClaimResult> => {
    const form = new FormData();
    form.append("file", payload.file);
    form.append("business_purpose", payload.businessPurpose);
    form.append("claimed_date", payload.claimedDate);
    form.append("expense_category", payload.expenseCategory);

    const response = await api.Claim.submitClaim({
      body: form,
    });

    if (response.status === 202) {
      return response.body;
    }

    throw new Error(getApiErrorMessage(response.body, "Submission failed"));
  }, [api]);

  const listClaims = useCallback(async (): Promise<ClaimResponse[]> => {
    const response = await api.Claim.listClaims();

    if (response.status === 200) {
      return response.body;
    }

    throw new Error(getApiErrorMessage(response.body, "Failed to load claims"));
  }, [api]);

  const listAdminClaims = useCallback(async (
    query?: AdminClaimsQuery,
  ): Promise<ClaimResponse[]> => {
    const response = await api.Claim.listAdminClaims({
      query: toAdminClaimsQuery(query),
    });

    if (response.status === 200) {
      return response.body;
    }

    throw new Error(
      getApiErrorMessage(response.body, "Failed to load review claims"),
    );
  }, [api, toAdminClaimsQuery]);

  const getClaim = useCallback(async (id: string): Promise<ClaimResponse> => {
    const response = await api.Claim.getClaim({
      params: { id },
    });

    if (response.status === 200) {
      return response.body;
    }

    throw new Error(getApiErrorMessage(response.body, "Failed to load claim"));
  }, [api]);

  const recomputePolicyMatch = useCallback(
    async (id: string): Promise<ClaimResponse> => {
      const response = await api.Claim.recomputePolicy({
        params: { id },
      });

      if (response.status === 200) {
        return response.body;
      }

      throw new Error(
        getApiErrorMessage(response.body, "Could not re-run policy match"),
      );
    },
    [api],
  );

  return useMemo(
    () => ({
      submitClaim,
      listClaims,
      listAdminClaims,
      getClaim,
      recomputePolicyMatch,
    }),
    [submitClaim, listClaims, listAdminClaims, getClaim, recomputePolicyMatch],
  );
}
