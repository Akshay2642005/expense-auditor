import { useAuditApi } from "@/api/audit";
import { useClaimsApi } from "@/api/claims";
import { cn } from "@/lib/utils";
import type { AuditResponse, ClaimResponse } from "@auditor/zod";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import {
  auditDecisionColor,
  type ClaimDateField,
  formatClaimDate,
  formatClaimStatus,
  getClaimDateValue,
  statusDot,
  statusTextColor,
} from "./claim-list-utils";

type ClaimPreviewProps = {
  claim: ClaimResponse;
  anchorRect: DOMRect;
  uploaderLabel?: string;
  dateField: ClaimDateField;
};

export function ClaimPreview({
  claim,
  anchorRect,
  uploaderLabel,
  dateField,
}: ClaimPreviewProps) {
  const { getClaim } = useClaimsApi();
  const { getAudit } = useAuditApi();

  const { data: detail } = useQuery({
    queryKey: ["claim", claim.id],
    queryFn: () => getClaim(claim.id),
    staleTime: 5 * 60 * 1000,
    initialData: claim,
  });

  const isAudited = ["approved", "flagged", "rejected"].includes(claim.status);
  const { data: audit } = useQuery<AuditResponse | null>({
    queryKey: ["audit", claim.id],
    queryFn: ({ signal }) => getAudit(claim.id, signal),
    enabled: isAudited,
    staleTime: 5 * 60 * 1000,
  });

  const resolvedClaim = detail ?? claim;
  const dotColor = statusDot[resolvedClaim.status] ?? "bg-muted-foreground/40";
  const textColor =
    statusTextColor[resolvedClaim.status] ?? "text-muted-foreground";

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const previewWidth = 288;
  const previewHeight = 320;
  const gap = 8;

  const spaceRight = viewportWidth - anchorRect.right - gap;
  const left =
    spaceRight >= previewWidth
      ? anchorRect.right + gap
      : anchorRect.left - previewWidth - gap;
  const top = Math.min(anchorRect.top, viewportHeight - previewHeight - gap);

  return (
    <div
      className="fixed z-50 w-72 animate-in fade-in-0 zoom-in-95 rounded-xl border bg-popover shadow-xl duration-150"
      style={{ left, top }}
    >
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <div className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", dotColor)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {resolvedClaim.merchantName ?? resolvedClaim.businessPurpose ?? "—"}
          </p>
          <p className={cn("text-xs capitalize", textColor)}>
            {formatClaimStatus(resolvedClaim.status)}
          </p>
        </div>
        {resolvedClaim.amount != null && (
          <span className="shrink-0 text-sm font-bold tabular-nums">
            {resolvedClaim.currency ?? ""}{" "}
            {Number(resolvedClaim.amount).toFixed(2)}
          </span>
        )}
      </div>

      <div className="space-y-2 px-4 py-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Category</span>
          <span className="font-medium capitalize">
            {resolvedClaim.expenseCategory}
          </span>
        </div>
        {uploaderLabel && (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Uploaded by</span>
            <span className="truncate text-right font-medium">
              {uploaderLabel}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {dateField === "submitted" ? "Submitted" : "Claimed"}
          </span>
          <span className="font-medium">
            {formatClaimDate(getClaimDateValue(resolvedClaim, dateField), dateField)}
          </span>
        </div>
        {resolvedClaim.businessPurpose && (
          <div className="pt-1">
            <p className="mb-0.5 text-muted-foreground">Purpose</p>
            <p className="line-clamp-2 leading-relaxed">
              {resolvedClaim.businessPurpose}
            </p>
          </div>
        )}

        {audit && (
          <div className="mt-2 space-y-1 rounded-lg border bg-muted/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">AI Decision</span>
              <span
                className={cn(
                  "font-semibold capitalize",
                  auditDecisionColor[audit.decision],
                )}
              >
                {audit.decision}
              </span>
            </div>
            <p className="line-clamp-3 leading-relaxed text-muted-foreground">
              {audit.reason}
            </p>
            <div className="flex justify-between pt-0.5 text-muted-foreground/70">
              <span>Confidence</span>
              <span>{Math.round((audit.confidence ?? 0) * 100)}%</span>
            </div>
          </div>
        )}

        {isAudited && !audit && (
          <div className="flex items-center gap-1.5 pt-1 text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Loading audit…</span>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-2">
        <p className="text-[11px] text-muted-foreground">
          Click to view full details
        </p>
      </div>
    </div>
  );
}

