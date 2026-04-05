import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrganizationMemberDirectoryEntry } from "@/hooks/useOrganizationMemberDirectory";
import { cn } from "@/lib/utils";
import type { AuditResponse } from "@auditor/zod";
import { Quote } from "lucide-react";
import { DetailRow } from "./ClaimDetailPrimitives";
import {
  compactId,
  formatAuditSourceLabel,
  formatAuditTimestamp,
  getDecisionToneClass,
} from "./claim-detail-utils";
import type { ExtendedAudit } from "./claim-detail-utils";

export function ClaimAuditDecisionCard({
  extAudit,
  isAdminView,
  isManualDecision,
  reviewerLabel,
  latestAutomatedAudit,
  memberDirectory,
  policyReference,
  policyId,
  hasMatchedPolicyEvidence,
  claimStatusLabel,
  claimStatusClassName,
}: {
  extAudit: ExtendedAudit | null;
  isAdminView: boolean;
  isManualDecision: boolean;
  reviewerLabel: string | null;
  latestAutomatedAudit: AuditResponse | null;
  memberDirectory: Record<string, OrganizationMemberDirectoryEntry>;
  policyReference: string | null;
  policyId: string | null;
  hasMatchedPolicyEvidence: boolean;
  claimStatusLabel: string;
  claimStatusClassName: string;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">
              {isManualDecision ? "Reviewer Decision" : "Audit Decision"}
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
      <CardContent className="flex flex-1 flex-col space-y-5 pt-6">
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

            {isManualDecision && latestAutomatedAudit && (
              <div className="rounded-2xl border border-border/60 bg-muted/[0.18] px-4 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">
                    Original AI decision preserved
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full px-3 py-1 capitalize",
                      getDecisionToneClass(latestAutomatedAudit.decision),
                    )}
                  >
                    {latestAutomatedAudit.decision}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Recorded {formatAuditTimestamp(latestAutomatedAudit.createdAt)}
                  {" by "}
                  {formatAuditSourceLabel(latestAutomatedAudit, memberDirectory)}
                  {`. Confidence ${Math.round(
                    (latestAutomatedAudit.confidence ?? 0) * 100,
                  )}%.`}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-foreground">
                  {latestAutomatedAudit.reason}
                </p>
              </div>
            )}

            <div className="grid gap-4">
              <div className="rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  {isManualDecision ? "Reviewer Comment" : "Decision Summary"}
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
                        : hasMatchedPolicyEvidence
                          ? "Matched policy attached"
                          : "No linked policy")
                    }
                  />
                  <DetailRow
                    label="Claim Status"
                    value={
                      <span className={cn("font-semibold", claimStatusClassName)}>
                        {claimStatusLabel}
                      </span>
                    }
                  />
                </div>
              </div>
            </div>

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
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            The audit engine is still processing this claim. Once the decision
            lands, you’ll see the reasoning, cited policy, and confidence here.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
