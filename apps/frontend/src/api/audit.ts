import { useCallback, useMemo } from "react";
import axios, { type AxiosRequestConfig } from "axios";
import { API_URL } from "@/config/env";
import type { AuditResponse } from "@auditor/zod";
import { getApiErrorMessage, useApiClient, useAuthHeaders } from "@/api/index";

/**
 * Hook providing typed helpers for audit-related endpoints.
 *
 * Provided functions:
 * - `getAudit(claimId, signal?)` -> `Promise<AuditResponse | null>` (returns null on 404)
 * - `hasAudit(claimId, signal?)` -> `Promise<boolean>`
 * - `downloadReceipt(claimId, signal?)` -> `Promise<Blob>`
 *
 * All functions apply authentication headers from Clerk's `getToken()` and
 * use `AxiosRequestConfig` for request options (including AbortSignal).
 */
export function useAuditApi() {
  const api = useApiClient();
  const getHeaders = useAuthHeaders();

  const getAudit = useCallback(
    async (claimId: string, signal?: AbortSignal): Promise<AuditResponse | null> => {
      void signal;
      const response = await api.Audit.getAuditResult({
        params: { id: claimId },
      });

      if (response.status === 200) {
        return response.body;
      }

      if (response.status === 404) {
        return null;
      }

      throw new Error(getApiErrorMessage(response.body, "Failed to load audit"));
    },
    [api],
  );

  const hasAudit = useCallback(
    async (claimId: string, signal?: AbortSignal): Promise<boolean> => {
      const audit = await getAudit(claimId, signal);
      return audit !== null;
    },
    [getAudit]
  );

  const downloadReceipt = useCallback(
    async (claimId: string, signal?: AbortSignal): Promise<Blob> => {
      const headers = await getHeaders();
      const url = `${API_URL}/api/v1/claims/${encodeURIComponent(claimId)}/receipt`;

      const config: AxiosRequestConfig = {
        headers,
        responseType: "blob",
        signal,
      };

      const resp = await axios.get<Blob>(url, config);
      return resp.data;
    },
    [getHeaders]
  );

  return useMemo(
    () => ({
      getAudit,
      hasAudit,
      downloadReceipt,
    }),
    [getAudit, hasAudit, downloadReceipt]
  );
}

export type { AuditResponse };
