import { useAuditApi } from "@/api/audit";
import { useClaimsApi } from "@/api/claims";
import { Button } from "@/components/ui/button";
import {
  formatOrganizationMemberLabel,
  useOrganizationMemberDirectory,
} from "@/hooks/useOrganizationMemberDirectory";
import { Card, CardContent } from "@/components/ui/card";
import type { AuditDecisionStatus } from "@auditor/zod";
import { ClaimAuditDecisionCard } from "@/features/claims/components/detail/ClaimAuditDecisionCard";
import {
  ClaimReceiptFileCard,
  ClaimReceiptSnapshotCard,
  ClaimSubmissionCard,
} from "@/features/claims/components/detail/ClaimInfoCards";
import { ClaimOverviewCard } from "@/features/claims/components/detail/ClaimOverviewCard";
import { ClaimReceiptPreviewCard } from "@/features/claims/components/detail/ClaimReceiptPreviewCard";
import { ClaimReviewerOverrideCard } from "@/features/claims/components/detail/ClaimReviewerOverrideCard";
import {
  compactId,
  formatClaimAmount,
  getDownloadFilename,
  isManualAuditDecision,
  POLL_INTERVAL_MS,
  statusConfig,
  TERMINAL_STATUSES,
} from "@/features/claims/components/detail/claim-detail-utils";
import type { ExtendedAudit } from "@/features/claims/components/detail/claim-detail-utils";
import { useAuth } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ClipboardList, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

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
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(
    null,
  );
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

  const {
    data: receiptPreviewBlob,
    isLoading: isReceiptPreviewLoading,
    isError: isReceiptPreviewError,
  } = useQuery({
    queryKey: ["claim-receipt", id],
    queryFn: async ({ signal }) => {
      if (!id) {
        throw new Error("Missing claim ID");
      }
      return downloadReceipt(id, signal);
    },
    enabled:
      !!id &&
      !!claim &&
      isAdminView &&
      !memberRouteRedirect &&
      !adminRouteRedirect,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const audit = isAdminView ? (adminClaimDetail?.audit ?? null) : memberAudit;
  const auditHistory = isAdminView ? (adminClaimDetail?.auditHistory ?? []) : [];

  // Cast to ExtendedAudit so we can safely render optional diagnostic fields
  const extAudit = audit as ExtendedAudit | null;
  const isManualDecision = isManualAuditDecision(extAudit);

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

  useEffect(() => {
    if (!receiptPreviewBlob) {
      setReceiptPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(receiptPreviewBlob);
    setReceiptPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [receiptPreviewBlob]);

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
    if (receiptPreviewUrl) {
      window.open(receiptPreviewUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setReceiptLoading(true);
    try {
      const blob = await downloadReceipt(claim.id);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");

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

  const handleDownloadReceipt = async () => {
    if (!claim) return;

    setReceiptLoading(true);
    try {
      const blob = receiptPreviewBlob ?? (await downloadReceipt(claim.id));
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = getDownloadFilename(claim.id, blob.type);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch {
      toast.error("Could not download receipt", {
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

  const cfg = statusConfig[claim.status] ?? statusConfig.pending;
  const isLive = !TERMINAL_STATUSES.has(claim.status);
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
  const receiptPreviewMimeType = receiptPreviewBlob?.type ?? "";
  const canInlineReceiptPreview =
    receiptPreviewMimeType === "application/pdf" ||
    receiptPreviewMimeType.startsWith("image/");
  const latestAutomatedAudit =
    auditHistory.find((entry) => !isManualAuditDecision(entry)) ?? null;
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

  const receiptPreviewSection = isAdminView ? (
    <ClaimReceiptPreviewCard
      receiptLoading={receiptLoading}
      isReceiptPreviewLoading={isReceiptPreviewLoading}
      isReceiptPreviewError={isReceiptPreviewError}
      receiptPreviewUrl={receiptPreviewUrl}
      canInlineReceiptPreview={canInlineReceiptPreview}
      receiptPreviewMimeType={receiptPreviewMimeType}
      onViewReceipt={handleViewReceipt}
      onDownloadReceipt={handleDownloadReceipt}
    />
  ) : null;

  const auditDecisionSection = (
    <ClaimAuditDecisionCard
      extAudit={extAudit}
      isAdminView={isAdminView}
      isManualDecision={isManualDecision}
      reviewerLabel={reviewerLabel}
      latestAutomatedAudit={latestAutomatedAudit}
      memberDirectory={memberDirectory}
      policyReference={policyReference}
      policyId={policyId}
      claimStatusLabel={cfg.label}
      claimStatusClassName={cfg.color}
    />
  );

  const reviewerOverrideSection = isAdminView ? (
    <ClaimReviewerOverrideCard
      overrideDecision={overrideDecision}
      overrideReason={overrideReason}
      overrideLoading={overrideLoading}
      onDecisionChange={setOverrideDecision}
      onReasonChange={setOverrideReason}
      onSave={handleOverride}
    />
  ) : null;

  const receiptSnapshotSection =
    claim.merchantName ||
      claim.amount != null ||
      claim.receiptDate ||
      claim.currency ? (
      <ClaimReceiptSnapshotCard
        claim={claim}
        amountLabel={amountLabel}
        receiptDateLabel={receiptDateLabel}
        claimedDateLabel={claimedDateLabel}
      />
    ) : null;

  const submissionSection = (
    <ClaimSubmissionCard
      claim={claim}
      submissionLabel={submissionLabel}
      isAdminView={isAdminView}
      uploaderLabel={uploaderLabel}
      claimedDateLabel={claimedDateLabel}
      createdAtLabel={createdAtLabel}
      policyReference={policyReference}
    />
  );

  const receiptFileSection =
    !isAdminView &&
      (!TERMINAL_STATUSES.has("pending") ||
        TERMINAL_STATUSES.has(claim.status)) ? (
      <ClaimReceiptFileCard
        receiptLoading={receiptLoading}
        onViewReceipt={handleViewReceipt}
      />
    ) : null;

  return (
    <div className="min-h-screen bg-background px-4 py-4 sm:px-6 sm:py-8">
      <div className={`mx-auto ${pageWidthClass} space-y-6 sm:space-y-8`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
            ← {backLabel}
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5" />
            <span>Claim {compactId(claim.id)}</span>
          </div>
        </div>

        <ClaimOverviewCard
          claim={claim}
          isAdminView={isAdminView}
          orgRole={orgRole}
          isLive={isLive}
          headlineTitle={headlineTitle}
          headlineSubtitle={headlineSubtitle}
          createdAtLabel={createdAtLabel}
          claimedDateLabel={claimedDateLabel}
          receiptDateLabel={receiptDateLabel}
          amountLabel={amountLabel}
          uploaderLabel={uploaderLabel}
          policyReference={policyReference}
          policyId={policyId}
          policyChunks={policyChunks}
          auditHistory={auditHistory}
          memberDirectory={memberDirectory}
          recomputeLoading={recomputeLoading}
          onRecomputePolicy={handleRecomputePolicy}
        />

        {isAdminView ? (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] xl:items-start">
              <div className="space-y-6">
                {receiptPreviewSection}
                {auditDecisionSection}
              </div>
              <div className="space-y-6">
                {receiptSnapshotSection}
                {submissionSection}
                {reviewerOverrideSection}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
            {auditDecisionSection}
            <div className="space-y-6">
              {receiptSnapshotSection}
              {submissionSection}
              {receiptFileSection}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
