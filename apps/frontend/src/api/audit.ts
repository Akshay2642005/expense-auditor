import { useCallback, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import axios, { type AxiosRequestConfig } from "axios";
import { API_URL } from "@/config/env";
import type { AuditResponse } from "@auditor/zod";

/**
 * Returns an async function that resolves to auth headers.
 * Follows the pattern used in `useClaimsApi` for consistency:
 * - If a token is present, returns `{ Authorization: "Bearer <token>" }`
 * - Otherwise, returns an empty object.
 */
function useAuthHeaders() {
  const { getToken } = useAuth();

  return useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);
}

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
  const getHeaders = useAuthHeaders();

  const getAudit = useCallback(
    async (claimId: string, signal?: AbortSignal): Promise<AuditResponse | null> => {
      const headers = await getHeaders();
      const url = `${API_URL}/api/v1/claims/${encodeURIComponent(claimId)}/audit`;

      const config: AxiosRequestConfig = {
        headers,
        signal,
      };

      try {
        const { data } = await axios.get<AuditResponse>(url, config);
        return data;
      } catch (err: unknown) {
        // 404 indicates no audit produced yet — map to null for callers.
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    [getHeaders]
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
