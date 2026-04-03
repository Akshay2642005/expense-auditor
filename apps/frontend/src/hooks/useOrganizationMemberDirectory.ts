import { useAuth, useOrganization } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";

type PublicUserData = {
  firstName: string | null;
  lastName: string | null;
  identifier: string;
  userId?: string;
};

type OrganizationMembership = {
  publicUserData?: PublicUserData;
  role?: string;
};

type OrganizationMembershipPage = {
  data: OrganizationMembership[];
  total_count: number;
};

export type OrganizationMemberDirectoryEntry = {
  email: string | null;
  fullName: string | null;
  role: string | null;
};

type OrganizationMemberDirectory = Record<
  string,
  OrganizationMemberDirectoryEntry
>;

function buildFullName(publicUserData: PublicUserData): string | null {
  const fullName = [publicUserData.firstName, publicUserData.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || null;
}

export function formatOrganizationMemberLabel(
  member: OrganizationMemberDirectoryEntry | undefined,
  fallbackUserId: string,
) {
  if (!member) return fallbackUserId;

  if (member.fullName && member.email) {
    return `${member.fullName} (${member.email})`;
  }

  return member.fullName ?? member.email ?? fallbackUserId;
}

export function useOrganizationMemberDirectory(enabled = true) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { organization } = useOrganization();

  const query = useQuery({
    queryKey: ["organization-members", organization?.id ?? "no-organization"],
    queryFn: async (): Promise<OrganizationMemberDirectory> => {
      if (!organization) return {};

      const pageSize = 100;
      let page = 1;
      let totalCount = 0;
      const directory: OrganizationMemberDirectory = {};

      do {
        const response = (await organization.getMemberships({
          initialPage: page,
          pageSize,
        })) as OrganizationMembershipPage;

        totalCount = response.total_count;

        for (const membership of response.data) {
          const publicUserData = membership.publicUserData;
          if (!publicUserData?.userId) continue;

          directory[publicUserData.userId] = {
            email: publicUserData.identifier || null,
            fullName: buildFullName(publicUserData),
            role: membership.role ?? null,
          };
        }

        if (response.data.length < pageSize) break;
        page += 1;
      } while ((page - 1) * pageSize < totalCount);

      return directory;
    },
    enabled: enabled && authLoaded && isSignedIn === true && !!organization,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    memberDirectory: query.data ?? {},
    ...query,
  };
}
