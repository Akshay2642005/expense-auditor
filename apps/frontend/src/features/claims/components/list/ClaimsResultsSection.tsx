import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatOrganizationMemberLabel,
  type OrganizationMemberDirectoryEntry,
} from "@/hooks/useOrganizationMemberDirectory";
import type { ClaimResponse } from "@auditor/zod";
import { RefreshCw, Receipt } from "lucide-react";

import { ClaimRow } from "./ClaimRow";
import { type ClaimDateField } from "./claim-list-utils";

type ClaimsResultsSectionProps = {
  heading: string;
  claims: ClaimResponse[];
  rawClaimCount: number;
  isAdminView: boolean;
  isInitialLoading: boolean;
  isFetching: boolean;
  activeFilterCount: number;
  dateField: ClaimDateField;
  emptyTitle: string;
  emptyBody: string;
  memberDirectory: Record<string, OrganizationMemberDirectoryEntry | undefined>;
  onSelectClaim: (claimId: string) => void;
  onCreateClaim?: () => void;
};

export function ClaimsResultsSection({
  heading,
  claims,
  rawClaimCount,
  isAdminView,
  isInitialLoading,
  isFetching,
  activeFilterCount,
  dateField,
  emptyTitle,
  emptyBody,
  memberDirectory,
  onSelectClaim,
  onCreateClaim,
}: ClaimsResultsSectionProps) {
  const filteredClaimCount = claims.length;
  const adminDateColumnLabel =
    dateField === "submitted" ? "Submitted" : "Claimed";

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{heading}</h2>
        <div className="flex items-center gap-2">
          {isFetching && !isInitialLoading && (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
          )}
          {filteredClaimCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {isAdminView && activeFilterCount > 0
                ? `${filteredClaimCount} of ${rawClaimCount}`
                : filteredClaimCount}{" "}
              {filteredClaimCount === 1 ? "claim" : "claims"}
            </span>
          )}
        </div>
      </div>

      {filteredClaimCount > 0 && (
        <div className="mb-2 flex items-center gap-4 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
          <div className="w-2 shrink-0" />
          <span className="flex-1">
            {isAdminView ? "Claim / Uploader" : "Merchant"}
          </span>
          <span className="hidden w-24 text-right sm:block">
            {isAdminView ? adminDateColumnLabel : "Claimed"}
          </span>
          <span className="w-20 text-right">Amount</span>
          <span className="hidden w-24 text-right sm:block">Status</span>
          <div className="w-3.5 shrink-0" />
        </div>
      )}

      {isInitialLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredClaimCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">{emptyTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{emptyBody}</p>
            </div>
            {!isAdminView && onCreateClaim && (
              <Button onClick={onCreateClaim}>Submit Expense</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {claims.map((claim) => {
            const uploaderLabel = formatOrganizationMemberLabel(
              memberDirectory[claim.userId],
              claim.userId,
            );

            return (
              <ClaimRow
                key={claim.id}
                claim={claim}
                isAdminView={isAdminView}
                dateField={isAdminView ? dateField : "claimed"}
                onClick={() => onSelectClaim(claim.id)}
                uploaderLabel={isAdminView ? uploaderLabel : undefined}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
