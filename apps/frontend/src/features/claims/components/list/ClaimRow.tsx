import { useAuditApi } from "@/api/audit";
import { useClaimsApi } from "@/api/claims";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ClaimResponse } from "@auditor/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ClaimPreview } from "./ClaimPreview";
import {
  type ClaimDateField,
  formatClaimDate,
  formatClaimStatus,
  getClaimDateValue,
  statusDot,
  statusIcon,
  statusTextColor,
} from "./claim-list-utils";

const HOVER_DELAY_MS = 600;

type ClaimRowProps = {
  claim: ClaimResponse;
  onClick: () => void;
  isAdminView: boolean;
  uploaderLabel?: string;
  dateField: ClaimDateField;
};

export function ClaimRow({
  claim,
  onClick,
  isAdminView,
  uploaderLabel,
  dateField,
}: ClaimRowProps) {
  const queryClient = useQueryClient();
  const { getClaim } = useClaimsApi();
  const { getAudit } = useAuditApi();

  const [preview, setPreview] = useState<{ rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const StatusIcon = statusIcon[claim.status] ?? Clock;
  const dotColor = statusDot[claim.status] ?? "bg-muted-foreground/40";
  const textColor = statusTextColor[claim.status] ?? "text-muted-foreground";
  const isAudited = ["approved", "flagged", "rejected"].includes(claim.status);

  const prefetch = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: ["claim", claim.id],
      queryFn: () => getClaim(claim.id),
      staleTime: 5 * 60 * 1000,
    });

    if (isAudited) {
      queryClient.prefetchQuery({
        queryKey: ["audit", claim.id],
        queryFn: ({ signal }) => getAudit(claim.id, signal),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [claim.id, getAudit, getClaim, isAudited, queryClient]);

  const handleMouseEnter = () => {
    prefetch();
    hoverTimer.current = setTimeout(() => {
      if (rowRef.current) {
        setPreview({ rect: rowRef.current.getBoundingClientRect() });
      }
    }, HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
    }
    setPreview(null);
  };

  useEffect(
    () => () => {
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
      }
    },
    [],
  );

  return (
    <>
      <div
        ref={rowRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="group flex cursor-pointer items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-all hover:bg-accent/50 hover:shadow-sm active:scale-[0.995]"
      >
        <div className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {claim.merchantName ?? claim.businessPurpose ?? "—"}
          </p>
          <p
            className={cn(
              "truncate text-xs text-muted-foreground",
              !isAdminView && "capitalize",
            )}
          >
            {isAdminView
              ? `Uploaded by ${uploaderLabel ?? claim.userId}`
              : claim.expenseCategory}
          </p>
          {isAdminView && (
            <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground/60">
              {claim.expenseCategory}
            </p>
          )}
        </div>

        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {formatClaimDate(getClaimDateValue(claim, dateField), dateField)}
        </span>

        {claim.amount != null ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {claim.currency ?? ""} {Number(claim.amount).toFixed(2)}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">—</span>
        )}

        <Badge
          variant="outline"
          className={cn(
            "hidden shrink-0 text-[11px] capitalize sm:flex",
            textColor,
          )}
        >
          <StatusIcon className="mr-1 h-3 w-3" />
          {formatClaimStatus(claim.status)}
        </Badge>

        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
      </div>

      {preview && (
        <ClaimPreview
          claim={claim}
          anchorRect={preview.rect}
          uploaderLabel={
            isAdminView ? (uploaderLabel ?? claim.userId) : undefined
          }
          dateField={dateField}
        />
      )}
    </>
  );
}
