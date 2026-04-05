import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OrganizationMemberDirectoryEntry } from "@/hooks/useOrganizationMemberDirectory";
import { cn } from "@/lib/utils";
import type {
  AdminClaimPolicyChunkResponse,
  AuditResponse,
  ClaimResponse,
} from "@auditor/zod";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { SummaryTile } from "./ClaimDetailPrimitives";
import { MatchedPolicyDialog, ReviewHistoryDialog } from "./ClaimDetailDialogs";
import {
  getDecisionTextClass,
  getDecisionToneClass,
  statusConfig,
} from "./claim-detail-utils";

export function ClaimOverviewCard({
  claim,
  isAdminView,
  orgRole,
  isLive,
  headlineTitle,
  headlineSubtitle,
  createdAtLabel,
  claimedDateLabel,
  receiptDateLabel,
  amountLabel,
  uploaderLabel,
  policyReference,
  policyId,
  policyChunks,
  auditHistory,
  memberDirectory,
  recomputeLoading,
  onRecomputePolicy,
}: {
  claim: ClaimResponse;
  isAdminView: boolean;
  orgRole?: string | null;
  isLive: boolean;
  headlineTitle: string;
  headlineSubtitle: string;
  createdAtLabel: string;
  claimedDateLabel: string;
  receiptDateLabel: string;
  amountLabel: string;
  uploaderLabel: string;
  policyReference: string | null;
  policyId: string | null;
  policyChunks: AdminClaimPolicyChunkResponse[];
  auditHistory: AuditResponse[];
  memberDirectory: Record<string, OrganizationMemberDirectoryEntry>;
  recomputeLoading: boolean;
  onRecomputePolicy: () => void;
}) {
  const cfg = statusConfig[claim.status] ?? statusConfig.pending;
  const Icon = cfg.icon;
  const issueBannerClass =
    claim.status === "ocr_failed"
      ? "bg-destructive/10 text-destructive"
      : "bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <Card className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
      <CardContent className="p-0">
        <div className="border-b border-border/60 bg-card">
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)] lg:px-7 lg:py-7">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className={cn(
                    "flex h-16 w-16 items-center justify-center rounded-2xl border bg-background",
                    getDecisionToneClass(claim.status),
                  )}
                >
                  <Icon className={cn("h-6 w-6", isLive && "animate-pulse")} />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    {isAdminView ? "Review Status" : "Claim Status"}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1
                      className={cn(
                        "text-2xl font-semibold tracking-tight sm:text-3xl",
                        getDecisionTextClass(claim.status),
                      )}
                    >
                      {cfg.label}
                    </h1>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-3 py-1 text-sm capitalize",
                        getDecisionToneClass(claim.status),
                      )}
                    >
                      {claim.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {headlineTitle}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {headlineSubtitle}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        Business Purpose
                      </p>
                      <p className="text-sm leading-relaxed text-foreground">
                        {claim.businessPurpose}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge
                    variant="outline"
                    className="rounded-full border-border/60 bg-card px-3 py-1"
                  >
                    Submitted {createdAtLabel}
                  </Badge>
                  {policyReference ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-border/60 bg-card px-3 py-1"
                    >
                      Policy {policyReference}
                    </Badge>
                  ) : null}
                  {isLive ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-border/60 bg-card px-3 py-1"
                    >
                      Auto-refreshing
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryTile
                  icon={Wallet}
                  label="Amount"
                  value={amountLabel}
                  toneClass={claim.amount != null ? "text-lg" : undefined}
                />
                <SummaryTile
                  icon={CalendarDays}
                  label="Claimed Date"
                  value={claimedDateLabel}
                />
                <SummaryTile
                  icon={ShieldCheck}
                  label="Category"
                  value={<span className="capitalize">{claim.expenseCategory}</span>}
                />
                <SummaryTile
                  icon={isAdminView ? Building2 : FileText}
                  label={isAdminView ? "Uploaded By" : "Receipt Date"}
                  value={isAdminView ? uploaderLabel : receiptDateLabel}
                />
              </div>

              {orgRole === "org:admin" && (
                <div className="flex justify-end">
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdminView ? (
                      <>
                        <MatchedPolicyDialog
                          policyChunks={policyChunks}
                          policyId={policyId}
                        />
                        <ReviewHistoryDialog
                          auditHistory={auditHistory}
                          memberDirectory={memberDirectory}
                        />
                      </>
                    ) : null}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRecomputePolicy}
                      disabled={recomputeLoading}
                      className="gap-2"
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          recomputeLoading && "animate-spin",
                        )}
                      />
                      Re-run Policy Match
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {(claim.ocrError || isAdminView) && (
          <div className="flex flex-col gap-3 px-5 py-4 lg:px-7">
            {claim.ocrError && (
              <div
                className={cn(
                  "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
                  issueBannerClass,
                )}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="leading-relaxed">{claim.ocrError}</p>
              </div>
            )}

            {isAdminView && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <p className="font-medium text-foreground">
                    Admin review mode
                  </p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">
                    This workspace is for finance review only. Manual decisions
                    are stored separately from the original AI audit so the
                    automated trail stays intact.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
