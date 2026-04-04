import { useAuditApi } from "@/api/audit";
import { useClaimsApi } from "@/api/claims";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  formatOrganizationMemberLabel,
  useOrganizationMemberDirectory,
} from "@/hooks/useOrganizationMemberDirectory";
import { cn } from "@/lib/utils";
import type { AuditDecisionStatus, AuditResponse } from "@auditor/zod";
import { useAuth } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  RefreshCw,
  AlertTriangle,
  XCircle,
  FileText,
  Quote,
  CalendarDays,
  Wallet,
  ClipboardList,
  ShieldCheck,
  Building2,
  MessageSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

/**
 * ExtendedAudit augments the canonical AuditResponse with a few optional
 * diagnostic fields that the backend may include (messages/explanation/details).
 * We use runtime-safe checks when rendering these fields so the UI stays
 * robust even if the shared zod schema doesn't include them yet.
 */
type ExtendedAudit = AuditResponse &
  Partial<{
    messages: unknown[];
    explanation?: string;
    details?: unknown;
    deterministicRule?: string;
  }>;

const POLL_INTERVAL_MS = 3_000;
const TERMINAL_STATUSES = new Set([
  "ocr_complete",
  "needs_review",
  "ocr_failed",
  "policy_matched",
  "auditing",
  "approved",
  "flagged",
  "rejected",
]);

const statusConfig: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    variant: "default" | "secondary" | "destructive" | "outline";
    color: string;
  }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    variant: "secondary",
    color: "text-muted-foreground",
  },
  processing: {
    label: "Processing",
    icon: RefreshCw,
    variant: "secondary",
    color: "text-blue-600 dark:text-blue-400",
  },
  ocr_complete: {
    label: "Under Review",
    icon: Eye,
    variant: "default",
    color: "text-primary",
  },
  policy_matched: {
    label: "Policy Matched",
    icon: CheckCircle2,
    variant: "outline",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  needs_review: {
    label: "Needs Review",
    icon: AlertTriangle,
    variant: "outline",
    color: "text-amber-600 dark:text-amber-400",
  },
  ocr_failed: {
    label: "OCR Failed",
    icon: AlertCircle,
    variant: "destructive",
    color: "text-destructive",
  },
  auditing: {
    label: "Auditing",
    icon: Eye,
    variant: "secondary",
    color: "text-blue-600",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    variant: "default",
    color: "text-green-600 dark:text-green-400",
  },
  flagged: {
    label: "Flagged",
    icon: AlertTriangle,
    variant: "outline",
    color: "text-amber-600",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    variant: "destructive",
    color: "text-destructive",
  },
};

const decisionToneClasses: Record<string, string> = {
  pending: "border-border/60 bg-background text-muted-foreground",
  processing:
    "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ocr_complete:
    "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  policy_matched:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  needs_review:
    "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ocr_failed: "border-destructive/20 bg-destructive/10 text-destructive",
  auditing:
    "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  approved:
    "border-emerald-500/20 bg-emerald-500/10 text-green-600 dark:text-green-400",
  flagged:
    "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rejected: "border-destructive/20 bg-destructive/10 text-destructive",
};

function getDecisionToneClass(status?: string) {
  return (
    decisionToneClasses[status ?? "pending"] ?? decisionToneClasses["pending"]
  );
}

function getDecisionTextClass(status?: string) {
  return statusConfig[status ?? "pending"]?.color ?? "text-foreground";
}

function formatClaimAmount(amount?: number | null, currency?: string | null) {
  if (amount == null) return "Pending OCR";

  const normalizedCurrency = currency?.trim().toUpperCase();
  if (normalizedCurrency && /^[A-Z]{3}$/.test(normalizedCurrency)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: normalizedCurrency,
        currencyDisplay: "code",
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // Fall back to plain formatting below.
    }
  }

  return `${normalizedCurrency ?? ""} ${amount.toFixed(2)}`.trim();
}

function compactId(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  toneClass,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  toneClass?: string;
}) {
  return (
    <div className="grid min-h-[118px] grid-cols-[minmax(0,1fr)_44px] gap-4 rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
      <div className="min-w-0 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            "min-w-0 text-sm font-medium leading-relaxed text-foreground",
            toneClass,
          )}
        >
          {value}
        </div>
      </div>
      <div className="flex h-11 w-11 items-center justify-center self-start rounded-xl border border-border/60 bg-card text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <dt className="pt-0.5 text-sm text-muted-foreground">{label}</dt>
      <dd className="max-w-[62%] break-words text-right text-sm font-medium leading-relaxed text-foreground">
        {value}
      </dd>
    </div>
  );
}

export function ClaimStatusPage({
  routeMode,
}: {
  routeMode?: "member" | "admin";
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgRole, isLoaded: authLoaded } = useAuth();
  const queryClient = useQueryClient();
  const {
    getClaim,
    getAdminClaimDetail,
    overrideAdminClaim,
    recomputePolicyMatch,
  } = useClaimsApi();
  const authIsAdmin = orgRole === "org:admin";
  const isAdminView =
    routeMode === "admin" ? true : routeMode === "member" ? false : authIsAdmin;
  const memberRouteRedirect =
    authLoaded && routeMode === "member" && authIsAdmin;
  const adminRouteRedirect =
    authLoaded && routeMode === "admin" && !authIsAdmin;
  const { memberDirectory } = useOrganizationMemberDirectory(isAdminView);
  const backPath = isAdminView ? "/admin/claims" : "/claims";
  const backLabel = isAdminView ? "Review Queue" : "All Claims";

  const [receiptLoading, setReceiptLoading] = useState(false);
  const [recomputeLoading, setRecomputeLoading] = useState(false);
  const [overrideDecision, setOverrideDecision] =
    useState<AuditDecisionStatus>("flagged");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);

  const {
    data: memberClaim,
    isLoading: isMemberClaimLoading,
    isError: isMemberClaimError,
  } = useQuery({
    queryKey: ["claim", id],
    queryFn: () => getClaim(id!),
    enabled:
      !!id && !isAdminView && !memberRouteRedirect && !adminRouteRedirect,
    refetchInterval: (query) =>
      query.state.data && TERMINAL_STATUSES.has(query.state.data.status)
        ? false
        : POLL_INTERVAL_MS,
  });

  const {
    data: adminClaimDetail,
    isLoading: isAdminClaimLoading,
    isError: isAdminClaimError,
  } = useQuery({
    queryKey: ["admin-claim", id],
    queryFn: () => getAdminClaimDetail(id!),
    enabled: !!id && isAdminView && !memberRouteRedirect && !adminRouteRedirect,
    refetchInterval: (query) =>
      query.state.data && TERMINAL_STATUSES.has(query.state.data.claim.status)
        ? false
        : POLL_INTERVAL_MS,
  });

  const claim = isAdminView ? adminClaimDetail?.claim : memberClaim;
  const isLoading = isAdminView ? isAdminClaimLoading : isMemberClaimLoading;
  const isError = isAdminView ? isAdminClaimError : isMemberClaimError;
  const policyChunks = isAdminView
    ? (adminClaimDetail?.policyChunks ?? [])
    : [];
  const policyId = isAdminView ? (adminClaimDetail?.policyId ?? null) : null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [claim?.status]);

  // Audit API hook + audit query
  const { getAudit, downloadReceipt } = useAuditApi();

  const { data: memberAudit } = useQuery({
    queryKey: ["audit", id],
    queryFn: async ({ signal }) => {
      if (!id) return null;
      // pass through the AbortSignal so requests can be cancelled by react-query
      return getAudit(id!, signal);
    },
    enabled:
      !memberRouteRedirect &&
      !adminRouteRedirect &&
      !isAdminView &&
      !!claim &&
      ["approved", "flagged", "rejected"].includes(claim.status),
    refetchInterval: (query) => (query.state.data ? false : POLL_INTERVAL_MS),
  });

  const audit = isAdminView ? (adminClaimDetail?.audit ?? null) : memberAudit;

  // Cast to ExtendedAudit so we can safely render optional diagnostic fields
  const extAudit = audit as ExtendedAudit | null;
  const isManualDecision =
    extAudit?.aiModel === "human_override" || !!extAudit?.overrideReason;

  useEffect(() => {
    if (!isAdminView || !claim) return;

    const nextDecision =
      extAudit?.decision ??
      (claim.status === "approved" ||
        claim.status === "flagged" ||
        claim.status === "rejected"
        ? claim.status
        : "flagged");

    setOverrideDecision(nextDecision as AuditDecisionStatus);
    setOverrideReason(
      extAudit?.aiModel === "human_override" && extAudit.overrideReason
        ? extAudit.overrideReason
        : "",
    );
  }, [
    id,
    isAdminView,
    claim,
    extAudit?.id,
    extAudit?.decision,
    extAudit?.aiModel,
    extAudit?.overrideReason,
  ]);

  if (memberRouteRedirect) {
    return (
      <Navigate to={id ? `/admin/claims/${id}` : "/admin/claims"} replace />
    );
  }

  if (adminRouteRedirect) {
    return <Navigate to={id ? `/claims/${id}` : "/claims"} replace />;
  }

  // Authenticated receipt viewer — uses downloadReceipt helper to fetch blob and open it
  const handleViewReceipt = async () => {
    if (!claim) return;
    setReceiptLoading(true);
    try {
      const blob = await downloadReceipt(claim.id);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();

      // Revoke after a short delay to allow the tab to load
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch {
      toast.error("Could not load receipt", {
        description: "Please try again.",
      });
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleRecomputePolicy = async () => {
    if (!claim) return;
    setRecomputeLoading(true);
    try {
      await recomputePolicyMatch(claim.id);
      await queryClient.invalidateQueries({ queryKey: ["claim", id] });
      await queryClient.invalidateQueries({ queryKey: ["admin-claim", id] });
      await queryClient.invalidateQueries({ queryKey: ["claims"] });
      toast.success("Policy match re-run");
    } catch {
      toast.error("Could not re-run policy match", {
        description: "Please try again.",
      });
    } finally {
      setRecomputeLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading claim…</p>
        </div>
      </div>
    );
  }

  if (isError || !claim) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="font-medium">Could not load this claim</p>
            <Button variant="outline" onClick={() => navigate(backPath)}>
              Back to Claims
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cfg = statusConfig[claim.status] ?? statusConfig["pending"]!;
  const Icon = cfg.icon;
  const isLive = !TERMINAL_STATUSES.has(claim.status);
  const issueBannerClass =
    claim.status === "ocr_failed"
      ? "bg-destructive/10 text-destructive"
      : "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const submissionLabel = isAdminView
    ? "Employee Submission"
    : "Your Submission";
  const uploaderLabel = formatOrganizationMemberLabel(
    memberDirectory[claim.userId],
    claim.userId,
  );
  const reviewerLabel = extAudit?.overriddenBy
    ? formatOrganizationMemberLabel(
      memberDirectory[extAudit.overriddenBy],
      extAudit.overriddenBy,
    )
    : null;
  const amountLabel = formatClaimAmount(claim.amount, claim.currency);
  const claimedDateLabel = new Date(claim.claimedDate).toLocaleDateString();
  const receiptDateLabel = claim.receiptDate
    ? new Date(claim.receiptDate).toLocaleDateString()
    : "Pending OCR";
  const createdAtLabel = new Date(claim.createdAt).toLocaleDateString();
  const pageWidthClass = isAdminView ? "max-w-6xl" : "max-w-5xl";
  const headlineTitle =
    claim.merchantName?.trim() ||
    (isAdminView ? "Claim Review Workspace" : "Expense Claim");
  const headlineSubtitle = isAdminView
    ? "Review the extracted receipt data, audit reasoning, and policy context before finalizing the claim."
    : "Track the extracted receipt data, audit reasoning, and final reimbursement outcome in one place.";
  const policyReference = policyId ? compactId(policyId) : null;
  const handleOverride = async () => {
    if (!claim || !isAdminView) return;

    const trimmedReason = overrideReason.trim();
    if (trimmedReason.length < 10) {
      toast.error("Reviewer comment is too short", {
        description: "Please add at least 10 characters before saving.",
      });
      return;
    }

    setOverrideLoading(true);
    try {
      const updatedDetail = await overrideAdminClaim(claim.id, {
        decision: overrideDecision,
        reason: trimmedReason,
      });

      queryClient.setQueryData(["admin-claim", id], updatedDetail);
      await queryClient.invalidateQueries({ queryKey: ["claims"] });
      await queryClient.invalidateQueries({ queryKey: ["claim", id] });
      await queryClient.invalidateQueries({ queryKey: ["audit", id] });

      toast.success("Reviewer decision saved", {
        description: "The claim status and audit record have been updated.",
      });
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "Please try again.";
      toast.error("Could not save reviewer decision", { description });
    } finally {
      setOverrideLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-4 sm:px-6 sm:py-8">
      <div className={cn("mx-auto space-y-6 sm:space-y-8", pageWidthClass)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
            ← {backLabel}
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5" />
            <span>Claim {compactId(claim.id)}</span>
          </div>
        </div>

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
                      <Icon
                        className={cn("h-6 w-6", isLive && "animate-pulse")}
                      />
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
                      value={
                        <span className="capitalize">
                          {claim.expenseCategory}
                        </span>
                      }
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
                        {isAdminView && policyChunks.length > 0 ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-2">
                                <FileText className="h-4 w-4" />
                                Matched Policy
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="flex max-h-[85vh] max-w-[calc(100vw-2rem)] flex-col gap-5 overflow-hidden border-border/60 bg-card p-6 sm:max-w-5xl lg:max-w-6xl">
                              <DialogHeader>
                                <DialogTitle>Matched Policy Context</DialogTitle>
                                <DialogDescription>
                                  Retrieved policy evidence used during review.
                                </DialogDescription>
                              </DialogHeader>
                              {policyId ? (
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                  Policy ID {compactId(policyId)}
                                </p>
                              ) : null}
                              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
                                {policyChunks.map((chunk, index) => (
                                  <div
                                    key={`${chunk.pageNum}-${index}`}
                                    className="rounded-2xl border border-border/60 bg-muted/20 p-5"
                                  >
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className="rounded-full border-border/60 bg-card px-3 py-1"
                                      >
                                        Page {chunk.pageNum}
                                      </Badge>
                                      <Badge
                                        variant="secondary"
                                        className="rounded-full px-3 py-1 capitalize"
                                      >
                                        {chunk.category}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        Match score {Math.round(chunk.score * 100)}%
                                      </span>
                                    </div>
                                    <p className="text-sm leading-7 text-foreground">
                                      {chunk.chunkText}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </DialogContent>
                          </Dialog>
                        ) : null}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRecomputePolicy}
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
                        This workspace is for finance review only. Manual
                        decisions are stored separately from the original AI
                        audit so the automated trail stays intact.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <div className="space-y-6">
            <Card className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {isManualDecision
                        ? "Reviewer Decision"
                        : "Audit Decision"}
                    </CardTitle>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {extAudit
                        ? isAdminView
                          ? "Review the latest decision, supporting rationale, and policy evidence before finalizing the claim."
                          : "This section explains how the receipt and policy were evaluated for your claim."
                        : "The audit summary will appear here after processing finishes."}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-fit rounded-full px-3 py-1 text-sm capitalize",
                        getDecisionToneClass(extAudit?.decision),
                      )}
                    >
                      {extAudit ? extAudit.decision : "Pending"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                {extAudit ? (
                  <>
                    {isManualDecision && (
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm">
                        <p className="font-medium text-foreground">
                          Final reviewer outcome
                        </p>
                        <p className="mt-1 leading-relaxed text-muted-foreground">
                          {reviewerLabel
                            ? `Saved by ${reviewerLabel}. The original AI decision is still preserved underneath this manual outcome.`
                            : "Saved as a manual reviewer decision while keeping the original AI trail intact."}
                        </p>
                      </div>
                    )}

                    <div className="grid gap-4">
                      <div className="rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
                        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                          {isManualDecision
                            ? "Reviewer Comment"
                            : "Decision Summary"}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-foreground">
                          {extAudit.reason}
                        </p>

                        {extAudit.citedPolicyText && (
                          <div className="mt-5 rounded-2xl border border-border/60 bg-muted/30 p-4">
                            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                              Cited Policy
                            </p>
                            <blockquote className="mt-3 flex gap-3 text-sm italic leading-relaxed text-muted-foreground">
                              <Quote className="mt-0.5 h-4 w-4 shrink-0 opacity-50" />
                              <span>{extAudit.citedPolicyText}</span>
                            </blockquote>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
                        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                          Decision Details
                        </p>
                        <div className="mt-4 space-y-3">
                          <DetailRow
                            label="Source"
                            value={
                              isManualDecision
                                ? (reviewerLabel ?? "Manual review")
                                : (extAudit.aiModel ?? "AI audit")
                            }
                          />
                          <DetailRow
                            label="Confidence"
                            value={
                              isManualDecision
                                ? "Manual"
                                : `${Math.round((extAudit.confidence ?? 0) * 100)}%`
                            }
                          />
                          <DetailRow
                            label="Policy Match"
                            value={
                              policyReference ??
                              (policyId
                                ? compactId(policyId)
                                : "No linked policy")
                            }
                          />
                          <DetailRow
                            label="Claim Status"
                            value={
                              <span className={cn("font-semibold", cfg.color)}>
                                {cfg.label}
                              </span>
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {(Array.isArray(extAudit.messages) ||
                      typeof extAudit.explanation === "string" ||
                      extAudit.details !== undefined ||
                      orgRole === "org:admin") && (
                        <div className="grid gap-4 xl:grid-cols-2">
                          {(Array.isArray(extAudit.messages) ||
                            typeof extAudit.explanation === "string" ||
                            extAudit.details !== undefined) && (
                              <details className="group rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
                                <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                                  Detailed Reasoning
                                </summary>
                                <div className="mt-4 space-y-3 text-sm">
                                  {Array.isArray(extAudit.messages) &&
                                    extAudit.messages.length > 0 ? (
                                    extAudit.messages.map((message, index) => (
                                      <pre
                                        key={index}
                                        className="overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-card p-3 text-xs leading-relaxed"
                                      >
                                        {typeof message === "string"
                                          ? message
                                          : JSON.stringify(message, null, 2)}
                                      </pre>
                                    ))
                                  ) : typeof extAudit.explanation === "string" ? (
                                    <pre className="overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-card p-3 text-xs leading-relaxed">
                                      {extAudit.explanation}
                                    </pre>
                                  ) : extAudit.details !== undefined ? (
                                    <pre className="overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-card p-3 text-xs leading-relaxed">
                                      {typeof extAudit.details === "string"
                                        ? extAudit.details
                                        : JSON.stringify(extAudit.details, null, 2)}
                                    </pre>
                                  ) : null}
                                </div>
                              </details>
                            )}
                        </div>
                      )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                    The audit engine is still processing this claim. Once the
                    decision lands, you’ll see the reasoning, cited policy, and
                    confidence here.
                  </div>
                )}
              </CardContent>
            </Card>

            {isAdminView && (
              <Card className="overflow-hidden border-amber-500/20 bg-card/95 shadow-sm">
                <CardHeader className="border-b border-border/50 pb-4">
                  <CardTitle className="text-lg">Reviewer Override</CardTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Finalize the human decision when the automated outcome needs
                    a manual adjustment or escalation note.
                  </p>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        Final Decision
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(["approved", "flagged", "rejected"] as const).map(
                          (decision) => (
                            <Button
                              key={decision}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setOverrideDecision(decision)}
                              className={cn(
                                "rounded-full border px-4 capitalize",
                                overrideDecision === decision
                                  ? getDecisionToneClass(decision)
                                  : "border-border/60 bg-background text-foreground hover:bg-muted/40",
                              )}
                            >
                              {decision}
                            </Button>
                          ),
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Saving creates a new manual review record and
                        immediately updates the claim status shown to the
                        employee.
                      </p>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        Reviewer Comment
                      </p>
                      <Textarea
                        value={overrideReason}
                        onChange={(event) =>
                          setOverrideReason(event.target.value)
                        }
                        placeholder="Explain why this claim should be approved, flagged, or rejected."
                        className="min-h-32 resize-y border-border/60 bg-background"
                        maxLength={1000}
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Minimum 10 characters required.</span>
                        <span>{overrideReason.trim().length}/1000</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      Use overrides for clear human review decisions. The
                      original AI audit is retained for traceability and later
                      analysis.
                    </p>
                    <Button
                      type="button"
                      onClick={handleOverride}
                      disabled={
                        overrideLoading || overrideReason.trim().length < 10
                      }
                      className="gap-2"
                    >
                      {overrideLoading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : null}
                      Save Reviewer Decision
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {(claim.merchantName ||
              claim.amount != null ||
              claim.receiptDate ||
              claim.currency) && (
                <Card className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
                  <CardHeader className="border-b border-border/50 pb-4">
                    <CardTitle className="text-lg">Receipt Snapshot</CardTitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Key fields extracted from the uploaded receipt before policy
                      review.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SummaryTile
                        icon={Wallet}
                        label="Receipt Amount"
                        value={amountLabel}
                      />
                      <SummaryTile
                        icon={ClipboardList}
                        label="Merchant"
                        value={claim.merchantName || "Awaiting OCR"}
                      />
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <div className="space-y-3">
                        <DetailRow
                          label="Receipt Date"
                          value={receiptDateLabel}
                        />
                        <DetailRow
                          label="Currency"
                          value={claim.currency || "Unknown"}
                        />
                        <DetailRow
                          label="Claimed Date"
                          value={claimedDateLabel}
                        />
                      </div>
                    </div>

                    {claim.dateMismatch && (
                      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <p className="leading-relaxed text-muted-foreground">
                          Receipt date differs from the claimed date beyond the
                          allowed threshold and should be reviewed carefully.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            <Card className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
              <CardHeader className="border-b border-border/50 pb-4">
                <CardTitle className="text-lg">{submissionLabel}</CardTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Submission facts captured when the employee sent this claim
                  for review.
                </p>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
                  <div className="space-y-3">
                    <DetailRow label="Claim ID" value={compactId(claim.id)} />
                    {isAdminView && (
                      <DetailRow label="Uploaded By" value={uploaderLabel} />
                    )}
                    <DetailRow
                      label="Category"
                      value={
                        <span className="capitalize">
                          {claim.expenseCategory}
                        </span>
                      }
                    />
                    <DetailRow label="Claimed Date" value={claimedDateLabel} />
                    <DetailRow label="Submitted" value={createdAtLabel} />
                    {policyReference ? (
                      <DetailRow label="Policy" value={policyReference} />
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>

            {!TERMINAL_STATUSES.has("pending") ||
              TERMINAL_STATUSES.has(claim.status) ? (
              <Card className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
                <CardHeader className="border-b border-border/50 pb-4">
                  <CardTitle className="text-lg">Receipt File</CardTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Open the original uploaded receipt in a separate tab for
                    full-size inspection.
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  <Button
                    variant="outline"
                    disabled={receiptLoading}
                    onClick={handleViewReceipt}
                    className="w-full gap-2"
                  >
                    {receiptLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    {receiptLoading ? "Opening receipt…" : "View Receipt"}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
