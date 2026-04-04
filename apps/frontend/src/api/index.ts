import { API_URL } from "@/config/env";
import { apiContract } from "@auditor/openapi/contracts";
import { useAuth } from "@clerk/clerk-react";
import { initClient } from "@ts-rest/core";
import { useCallback, useMemo } from "react";
import axios, {
  type Method,
  AxiosError,
  isAxiosError,
  type AxiosResponse,
} from "axios";

type Headers = Awaited<
  ReturnType<NonNullable<Parameters<typeof initClient>[1]["api"]>>
>["headers"];

export type TApiClient = ReturnType<typeof useApiClient>;

export function useAuthHeaders() {
  const { getToken } = useAuth();

  return useCallback(async (): Promise<Record<string, string>> => {
    for (let i = 0; i < 5; i++) {
      const token = await getToken();
      if (token) return { Authorization: `Bearer ${token}` };
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error("Auth token unavailable");
  }, [getToken]);
}

export function getApiErrorMessage(
  body: unknown,
  fallback = "Request failed",
): string {
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }

  return fallback;
}

export const useApiClient = ({ isBlob = false }: { isBlob?: boolean } = {}) => {
  const getAuthHeaders = useAuthHeaders();

  return useMemo(
    () =>
      initClient(apiContract, {
        baseUrl: "",
        api: async ({ path, method, headers, body }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const makeRequest = async (retryCount = 0): Promise<any> => {
            const authHeaders = await getAuthHeaders();
            const requestHeaders = {
              ...headers,
              ...authHeaders,
            } as Record<string, string>;

            if (body instanceof FormData) {
              delete requestHeaders["Content-Type"];
              delete requestHeaders["content-type"];
            } else if (body !== undefined && !requestHeaders["Content-Type"]) {
              requestHeaders["Content-Type"] = "application/json";
            }

            try {
              const result = await axios.request({
                method: method as Method,
                url: `${API_URL}/api${path}`,
                headers: requestHeaders,
                data: body,
                ...(isBlob ? { responseType: "blob" } : {}),
              });
              return {
                status: result.status,
                body: result.data,
                headers: result.headers as unknown as Headers,
              };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (e: Error | AxiosError | any) {
              if (isAxiosError(e)) {
                const error = e as AxiosError;
                const response = error.response as AxiosResponse;

                if (response?.status === 401 && retryCount < 2) {
                  return makeRequest(retryCount + 1);
                }

                return {
                  status: response?.status || 500,
                  body: response?.data || { message: "Internal server error" },
                  headers: (response?.headers as unknown as Headers) || {},
                };
              }
              throw e;
            }
          };

          return makeRequest();
        },
      }),
    [getAuthHeaders, isBlob],
  );
};

