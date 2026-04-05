import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { OrganizationMemberDirectoryEntry } from "@/hooks/useOrganizationMemberDirectory";
import type {
  AdminClaimPolicyChunkResponse,
  AuditResponse,
} from "@auditor/zod";
import { FileText, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { DetailRow } from "./ClaimDetailPrimitives";
import {
  compactId,
  formatAuditSourceLabel,
  formatAuditTimestamp,
  getDecisionToneClass,
  isManualAuditDecision,
} from "./claim-detail-utils";

export function MatchedPolicyDialog({
  policyChunks,
  policyId,
}: {
  policyChunks: AdminClaimPolicyChunkResponse[];
  policyId: string | null;
}) {
  if (policyChunks.length === 0) return null;

  return (
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
  );
}

export function ReviewHistoryDialog({
  auditHistory,
  memberDirectory,
}: {
  auditHistory: AuditResponse[];
  memberDirectory: Record<string, OrganizationMemberDirectoryEntry>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <History className="h-4 w-4" />
          Review History
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] max-w-[calc(100vw-2rem)] flex-col gap-5 overflow-hidden border-border/60 bg-card p-6 sm:max-w-4xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review History</DialogTitle>
          <DialogDescription>
            Every automated and manual decision recorded for this claim, with
            reviewer attribution and timestamps.
          </DialogDescription>
        </DialogHeader>
        {auditHistory.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            <div className="space-y-4">
              {auditHistory.map((entry, index) => {
                const manualEntry = isManualAuditDecision(entry);
                const sourceLabel = formatAuditSourceLabel(
                  entry,
                  memberDirectory,
                );

                return (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-border/60 bg-muted/[0.18] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {index === 0 ? (
                        <Badge
                          variant="secondary"
                          className="rounded-full px-3 py-1"
                        >
                          Latest
                        </Badge>
                      ) : null}
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-3 py-1 capitalize",
                          getDecisionToneClass(entry.decision),
                        )}
                      >
                        {entry.decision}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full border-border/60 bg-card px-3 py-1"
                      >
                        {manualEntry ? "Manual review" : "Automated audit"}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-3">
                      <DetailRow
                        label="Recorded"
                        value={formatAuditTimestamp(entry.createdAt)}
                      />
                      <DetailRow
                        label={manualEntry ? "Reviewer" : "Source"}
                        value={sourceLabel}
                      />
                      <DetailRow
                        label="Confidence"
                        value={
                          manualEntry
                            ? "Manual"
                            : `${Math.round((entry.confidence ?? 0) * 100)}%`
                        }
                      />
                    </div>

                    <div className="mt-4 rounded-2xl border border-border/60 bg-card/70 p-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        {manualEntry ? "Reviewer Comment" : "Decision Rationale"}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed text-foreground">
                        {entry.reason}
                      </p>

                      {entry.citedPolicyText ? (
                        <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                            Cited Policy
                          </p>
                          <p className="mt-3 text-sm italic leading-relaxed text-muted-foreground">
                            {entry.citedPolicyText}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            Review history will appear here after the first audit or manual
            override is saved.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
