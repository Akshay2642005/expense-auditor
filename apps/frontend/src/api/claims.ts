import type {
  AdminClaimDetailResponse,
  AdminClaimDateField,
  AdminClaimFlagFilter,
  AdminClaimSortBy,
  AdminClaimSortDir,
  AdminClaimOverrideRequest,
  ClaimResponse,
  ClaimStatus,
  SubmitClaimResponse,
} from "@auditor/zod";
import axios from "axios";
import { useCallback, useMemo } from "react";
import { API_URL } from "@/config/env";
import { getApiErrorMessage, useApiClient, useAuthHeaders } from "@/api/index";

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
  const getHeaders = useAuthHeaders();

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

    try {
      const headers = await getHeaders();
      const response = await axios.post<SubmitClaimResult>(
        `${API_URL}/api/v1/claims`,
        form,
        { headers },
      );

      if (response.status === 202) {
        return response.data;
      }

      throw new Error("Submission failed");
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          getApiErrorMessage(error.response?.data, "Submission failed"),
        );
      }

      throw error instanceof Error
        ? error
        : new Error("Submission failed");
    }
  }, [getHeaders]);

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

  const getAdminClaimDetail = useCallback(
    async (id: string): Promise<AdminClaimDetailResponse> => {
      const response = await api.Claim.getAdminClaim({
        params: { id },
      });

      if (response.status === 200) {
        return response.body;
      }

      throw new Error(
        getApiErrorMessage(response.body, "Failed to load admin claim"),
      );
    },
    [api],
  );

  const overrideAdminClaim = useCallback(
    async (
      id: string,
      payload: AdminClaimOverrideRequest,
    ): Promise<AdminClaimDetailResponse> => {
      const response = await api.Claim.overrideAdminClaim({
        params: { id },
        body: payload,
      });

      if (response.status === 200) {
        return response.body;
      }

      throw new Error(
        getApiErrorMessage(response.body, "Could not save reviewer decision"),
      );
    },
    [api],
  );

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
      getAdminClaimDetail,
      overrideAdminClaim,
      recomputePolicyMatch,
    }),
    [
      submitClaim,
      listClaims,
      listAdminClaims,
      getClaim,
      getAdminClaimDetail,
      overrideAdminClaim,
      recomputePolicyMatch,
    ],
  );
}
