import { useCallback, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import axios from "axios";
import { API_URL } from "@/config/env";
import type { Policy } from "@auditor/zod";

function useApiHeaders() {
  const { getToken } = useAuth();
  return useCallback(async () => {
    // Retry until Clerk's JWT is hydrated (guards against post-refresh race)
    for (let i = 0; i < 5; i++) {
      const token = await getToken();
      if (token) return { Authorization: `Bearer ${token}` };
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("Auth token unavailable");
  }, [getToken]);
}

export function usePolicyApi() {
  const getHeaders = useApiHeaders();

  const getActivePolicy = useCallback(async (): Promise<Policy | null> => {
    const headers = await getHeaders();
    const { data } = await axios.get<Policy | null>(`${API_URL}/api/v1/policy/active`, { headers });
    return data;
  }, [getHeaders]);

  const getActivePolicyDownloadUrl = useCallback(async (): Promise<string> => {
    const headers = await getHeaders();
    const { data } = await axios.get<Blob>(
      `${API_URL}/api/v1/policy/active/download`,
      { headers, responseType: "blob" }
    );
    return URL.createObjectURL(data);
  }, [getHeaders]);

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

  return useMemo(() => ({ getActivePolicy, getActivePolicyDownloadUrl, uploadPolicy, listPolicies, getPolicy }), [
    getActivePolicy,
    getActivePolicyDownloadUrl,
    uploadPolicy,
    listPolicies,
    getPolicy,
  ]);
}
