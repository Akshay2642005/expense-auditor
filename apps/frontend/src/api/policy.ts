import { useCallback, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import axios from "axios";
import { API_URL } from "@/config/env";
import type { Policy } from "@auditor/zod";

function useApiHeaders() {
  const { getToken } = useAuth();
  return useCallback(async () => {
    const token = await getToken();
    return { Authorization: `Bearer ${token}` };
  }, [getToken]);
}

export function usePolicyApi() {
  const getHeaders = useApiHeaders();

  const uploadPolicy = useCallback(async (formData: FormData): Promise<Policy> => {
    const headers = await getHeaders();
    const { data } = await axios.post<Policy>(
      `${API_URL}/api/v1/admin/policy`,
      formData,
      { headers: { ...headers } } // axios sets multipart boundary automatically
    );
    return data;
  }, [getHeaders]);

  const listPolicies = useCallback(async (): Promise<Policy[]> => {
    const headers = await getHeaders();
    const { data } = await axios.get<Policy[]>(`${API_URL}/api/v1/admin/policy`, {
      headers,
    });
    if (!Array.isArray(data)) {
      throw new Error("Invalid policy list response");
    }
    return data;
  }, [getHeaders]);

  const getPolicy = useCallback(async (id: string): Promise<Policy> => {
    const headers = await getHeaders();
    const { data } = await axios.get<Policy>(
      `${API_URL}/api/v1/admin/policy/${id}`,
      { headers }
    );
    return data;
  }, [getHeaders]);

  return useMemo(() => ({ uploadPolicy, listPolicies, getPolicy }), [
    uploadPolicy,
    listPolicies,
    getPolicy,
  ]);
}
