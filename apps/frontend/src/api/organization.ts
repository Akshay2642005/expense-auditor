import { useCallback, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import axios from "axios";
import { API_URL } from "@/config/env";

type CreateInvitationInput = {
  emailAddress: string;
  role?: "org:member" | "org:admin";
};

type CreateInvitationResponse = {
  id: string;
  emailAddress: string;
  role: string;
  status: string;
  redirectUrl: string;
};

function useAuthHeaders() {
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

export function useOrganizationApi() {
  const getHeaders = useAuthHeaders();

  const createInvitation = useCallback(
    async ({ emailAddress, role = "org:member" }: CreateInvitationInput): Promise<CreateInvitationResponse> => {
      const headers = await getHeaders();
      const { data } = await axios.post<CreateInvitationResponse>(
        `${API_URL}/api/v1/admin/organization/invitations`,
        { emailAddress, role },
        { headers },
      );

      return data;
    },
    [getHeaders],
  );

  return useMemo(
    () => ({
      createInvitation,
    }),
    [createInvitation],
  );
}
