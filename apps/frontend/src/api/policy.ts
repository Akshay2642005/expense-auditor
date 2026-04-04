import { useCallback, useMemo } from "react";
import axios from "axios";
import { API_URL } from "@/config/env";
import type { Policy } from "@auditor/zod";
import { getApiErrorMessage, useApiClient, useAuthHeaders } from "@/api/index";

export function usePolicyApi() {
  const api = useApiClient();
  const getHeaders = useAuthHeaders();

  const getActivePolicy = useCallback(async (): Promise<Policy | null> => {
    const response = await api.Policy.getActivePolicy();

    if (response.status === 200) {
      return response.body;
    }

    throw new Error(
      getApiErrorMessage(response.body, "Failed to load active policy"),
    );
  }, [api]);

  const getActivePolicyDownloadUrl = useCallback(async (): Promise<string> => {
    const headers = await getHeaders();
    const { data } = await axios.get<Blob>(
      `${API_URL}/api/v1/policy/active/download`,
      { headers, responseType: "blob" }
    );
    return URL.createObjectURL(data);
  }, [getHeaders]);

  const uploadPolicy = useCallback(async (formData: FormData): Promise<Policy> => {
    const response = await api.Policy.uploadPolicy({
      body: formData,
    });

    if (response.status === 202) {
      return response.body;
    }

    throw new Error(getApiErrorMessage(response.body, "Failed to upload policy"));
  }, [api]);

  const listPolicies = useCallback(async (): Promise<Policy[]> => {
    const response = await api.Policy.listPolicies();

    if (response.status === 200) {
      return response.body;
    }

    throw new Error(
      getApiErrorMessage(response.body, "Failed to load policies"),
    );
  }, [api]);

  const getPolicy = useCallback(async (id: string): Promise<Policy> => {
    const response = await api.Policy.getPolicy({
      params: { id },
    });

    if (response.status === 200) {
      return response.body;
    }

    throw new Error(getApiErrorMessage(response.body, "Failed to load policy"));
  }, [api]);

  return useMemo(() => ({ getActivePolicy, getActivePolicyDownloadUrl, uploadPolicy, listPolicies, getPolicy }), [
    getActivePolicy,
    getActivePolicyDownloadUrl,
    uploadPolicy,
    listPolicies,
    getPolicy,
  ]);
}
