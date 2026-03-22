import { useAuth } from "@clerk/clerk-react";
import axios from "axios";
import { API_URL } from "@/config/env";

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

// Custom hook for claim mutations that can't go through ts-rest (multipart)
export function useClaimsApi() {
  const { getToken } = useAuth();

  const getAuthHeaders = async () => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const submitClaim = async (payload: SubmitClaimPayload): Promise<SubmitClaimResult> => {
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

  return { submitClaim };
}
