import { API_URL } from "@/config/env";
import type {
  AdminClaimDateField,
  AdminClaimFlagFilter,
  AdminClaimSortBy,
  AdminClaimSortDir,
  ClaimResponse,
  ClaimStatus,
} from "@auditor/zod";
import { useAuth } from "@clerk/clerk-react";
import axios from "axios";

export interface SubmitClaimPayload {
  file: File;
  businessPurpose: string;
  claimedDate: string; // YYYY-MM-DD
  expenseCategory: "meals" | "transport" | "lodging" | "other";
}

export interface SubmitClaimResult {
  claimId: string;
  status: string;
  message: string;
}

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

// Custom hook for claim mutations that can't go through ts-rest (multipart)
export function useClaimsApi() {
  const { getToken } = useAuth();

  const getAuthHeaders = async () => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const submitClaim = async (
    payload: SubmitClaimPayload,
  ): Promise<SubmitClaimResult> => {
    const form = new FormData();
    form.append("file", payload.file);
    form.append("business_purpose", payload.businessPurpose);
    form.append("claimed_date", payload.claimedDate);
    form.append("expense_category", payload.expenseCategory);

    const headers = await getAuthHeaders();
    const response = await axios.post<SubmitClaimResult>(
      `${API_URL}/api/v1/claims`,
      form,
      { headers: { ...headers } },
    );
    return response.data;
  };

  const listAdminClaims = async (
    query?: AdminClaimsQuery,
  ): Promise<ClaimResponse[]> => {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();

    if (query?.q) params.set("q", query.q);
    if (query?.statuses?.length)
      params.set("statuses", query.statuses.join(","));
    if (query?.uploaderUserId)
      params.set("uploaderUserId", query.uploaderUserId);
    if (query?.flagged && query.flagged !== "all") {
      params.set("flagged", query.flagged);
    }
    if (query?.dateField && query.dateField !== "submitted") {
      params.set("dateField", query.dateField);
    }
    if (query?.dateFrom) params.set("dateFrom", query.dateFrom);
    if (query?.dateTo) params.set("dateTo", query.dateTo);
    if (query?.sortBy && query.sortBy !== "submittedDate") {
      params.set("sortBy", query.sortBy);
    }
    if (query?.sortDir && query.sortDir !== "desc") {
      params.set("sortDir", query.sortDir);
    }

    const queryString = params.toString();
    const response = await axios.get<ClaimResponse[]>(
      `${API_URL}/api/v1/admin/claims${queryString ? `?${queryString}` : ""}`,
      { headers },
    );

    return response.data;
  };

  return { submitClaim, listAdminClaims };
}
