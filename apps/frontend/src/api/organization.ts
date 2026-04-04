import { useCallback, useMemo } from "react";
import {
  getApiErrorMessage,
  useApiClient,
} from "@/api/index";
import type { CreateOrganizationInvitationResponse } from "@auditor/zod";

type CreateInvitationInput = {
  emailAddress: string;
  role?: "org:member" | "org:admin";
};

export function useOrganizationApi() {
  const api = useApiClient();

  const createInvitation = useCallback(
    async ({
      emailAddress,
      role = "org:member",
    }: CreateInvitationInput): Promise<CreateOrganizationInvitationResponse> => {
      const response = await api.Organization.createInvitation({
        body: { emailAddress, role },
      });

      if (response.status === 201) {
        return response.body;
      }

      throw new Error(
        getApiErrorMessage(response.body, "Failed to send invitation"),
      );
    },
    [api],
  );

  return useMemo(
    () => ({
      createInvitation,
    }),
    [createInvitation],
  );
}
