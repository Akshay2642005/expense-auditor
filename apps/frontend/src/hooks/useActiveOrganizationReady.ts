import { useAuth, useOrganizationList } from "@clerk/clerk-react";

export function useActiveOrganizationReady() {
  const { isLoaded: authLoaded, isSignedIn, orgId } = useAuth();
  const { userMemberships, isLoaded: membershipsLoaded } = useOrganizationList({
    userMemberships: { infinite: false },
  });

  const membershipCount = userMemberships.data?.length ?? 0;
  const hasMemberships = membershipCount > 0;

  const isWaitingForActivation =
    authLoaded &&
    isSignedIn === true &&
    !orgId &&
    (!membershipsLoaded || hasMemberships);

  const isReady =
    authLoaded &&
    isSignedIn === true &&
    (!!orgId || (membershipsLoaded && !hasMemberships));

  return {
    orgId,
    hasMemberships,
    isReady,
    isWaitingForActivation,
  };
}
