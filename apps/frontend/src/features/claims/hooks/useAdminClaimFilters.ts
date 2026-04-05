import {
  formatOrganizationMemberLabel,
  type OrganizationMemberDirectoryEntry,
} from "@/hooks/useOrganizationMemberDirectory";
import type {
  AdminClaimDateField,
  AdminClaimFlagFilter,
  AdminClaimSortBy,
  AdminClaimSortDir,
  ClaimResponse,
  ClaimStatus,
} from "@auditor/zod";
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from "react";

import {
  compareAdminClaims,
  formatClaimStatus,
  getClaimDateKey,
  getClaimSearchableText,
} from "../components/list/claim-list-utils";

type UseAdminClaimFiltersArgs = {
  claims: ClaimResponse[];
  memberDirectory: Record<string, OrganizationMemberDirectoryEntry | undefined>;
  currentUserId?: string | null;
};

export function useAdminClaimFilters({
  claims,
  memberDirectory,
  currentUserId,
}: UseAdminClaimFiltersArgs) {
  const [adminSearchText, setAdminSearchText] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<ClaimStatus[]>([]);
  const [selectedUploaderUserId, setSelectedUploaderUserId] = useState("");
  const [flaggedFilter, setFlaggedFilter] =
    useState<AdminClaimFlagFilter>("all");
  const [dateField, setDateField] =
    useState<AdminClaimDateField>("submitted");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<AdminClaimSortBy>("submittedDate");
  const [sortDir, setSortDir] = useState<AdminClaimSortDir>("desc");

  const deferredAdminSearchText = useDeferredValue(adminSearchText.trim());

  const filteredClaims = useMemo(
    () =>
      claims
        .filter((claim) => {
          if (deferredAdminSearchText) {
            const normalizedQuery = deferredAdminSearchText.toLocaleLowerCase();
            if (!getClaimSearchableText(claim).includes(normalizedQuery)) {
              return false;
            }
          }

          if (
            selectedStatuses.length > 0 &&
            !selectedStatuses.includes(claim.status)
          ) {
            return false;
          }

          if (
            selectedUploaderUserId &&
            claim.userId !== selectedUploaderUserId
          ) {
            return false;
          }

          if (flaggedFilter === "flagged" && claim.status !== "flagged") {
            return false;
          }
          if (flaggedFilter === "unflagged" && claim.status === "flagged") {
            return false;
          }

          const claimDateKey = getClaimDateKey(claim, dateField);
          if (dateFrom && claimDateKey < dateFrom) {
            return false;
          }
          if (dateTo && claimDateKey > dateTo) {
            return false;
          }

          return true;
        })
        .toSorted((left, right) =>
          compareAdminClaims(left, right, sortBy, sortDir),
        ),
    [
      claims,
      dateField,
      dateFrom,
      dateTo,
      deferredAdminSearchText,
      flaggedFilter,
      selectedStatuses,
      selectedUploaderUserId,
      sortBy,
      sortDir,
    ],
  );

  const uploaderOptions = useMemo(
    () =>
      Object.entries(memberDirectory)
        .filter(([userId, member]) => {
          if (!member) return false;
          if (userId === currentUserId) return false;
          return member.role === "org:member";
        })
        .map(([userId, member]) => ({
          userId,
          label: formatOrganizationMemberLabel(member, userId),
        }))
        .toSorted((left, right) => left.label.localeCompare(right.label)),
    [currentUserId, memberDirectory],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (adminSearchText.trim()) count += 1;
    if (selectedStatuses.length > 0) count += 1;
    if (selectedUploaderUserId) count += 1;
    if (flaggedFilter !== "all") count += 1;
    if (dateField !== "submitted") count += 1;
    if (dateFrom) count += 1;
    if (dateTo) count += 1;
    if (sortBy !== "submittedDate") count += 1;
    if (sortDir !== "desc") count += 1;
    return count;
  }, [
    adminSearchText,
    dateField,
    dateFrom,
    dateTo,
    flaggedFilter,
    selectedStatuses.length,
    selectedUploaderUserId,
    sortBy,
    sortDir,
  ]);

  const toggleStatusFilter = useCallback((status: ClaimStatus) => {
    setSelectedStatuses((currentStatuses) =>
      currentStatuses.includes(status)
        ? currentStatuses.filter((currentStatus) => currentStatus !== status)
        : [...currentStatuses, status],
    );
  }, []);

  const clearAdminFilters = useCallback(() => {
    setAdminSearchText("");
    setSelectedStatuses([]);
    setSelectedUploaderUserId("");
    setFlaggedFilter("all");
    setDateField("submitted");
    setDateFrom("");
    setDateTo("");
    setSortBy("submittedDate");
    setSortDir("desc");
  }, []);

  const statusFilterLabel =
    selectedStatuses.length === 0
      ? "All statuses"
      : selectedStatuses.length === 1
        ? formatClaimStatus(selectedStatuses[0])
        : `${selectedStatuses.length} statuses`;

  return {
    adminSearchText,
    setAdminSearchText,
    selectedStatuses,
    selectedUploaderUserId,
    setSelectedUploaderUserId,
    flaggedFilter,
    setFlaggedFilter,
    dateField,
    setDateField,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    filteredClaims,
    uploaderOptions,
    activeFilterCount,
    toggleStatusFilter,
    clearAdminFilters,
    statusFilterLabel,
  };
}
