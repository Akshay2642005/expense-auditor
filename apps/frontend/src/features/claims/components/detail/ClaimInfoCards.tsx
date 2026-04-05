import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClaimResponse } from "@auditor/zod";
import { AlertTriangle, ClipboardList, FileText, RefreshCw, Wallet } from "lucide-react";
import { DetailRow, SummaryTile } from "./ClaimDetailPrimitives";
import { compactId } from "./claim-detail-utils";

export function ClaimReceiptSnapshotCard({
  claim,
  amountLabel,
  receiptDateLabel,
  claimedDateLabel,
}: {
  claim: ClaimResponse;
  amountLabel: string;
  receiptDateLabel: string;
  claimedDateLabel: string;
}) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardTitle className="text-lg">Receipt Snapshot</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Key fields extracted from the uploaded receipt before policy review.
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
            <DetailRow label="Receipt Date" value={receiptDateLabel} />
            <DetailRow label="Currency" value={claim.currency || "Unknown"} />
            <DetailRow label="Claimed Date" value={claimedDateLabel} />
          </div>
        </div>

        {claim.dateMismatch && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="leading-relaxed text-muted-foreground">
              Receipt date differs from the claimed date beyond the allowed
              threshold and should be reviewed carefully.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ClaimSubmissionCard({
  claim,
  submissionLabel,
  isAdminView,
  uploaderLabel,
  claimedDateLabel,
  createdAtLabel,
  policyReference,
}: {
  claim: ClaimResponse;
  submissionLabel: string;
  isAdminView: boolean;
  uploaderLabel: string;
  claimedDateLabel: string;
  createdAtLabel: string;
  policyReference: string | null;
}) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardTitle className="text-lg">{submissionLabel}</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Submission facts captured when the employee sent this claim for
          review.
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
          <div className="space-y-3">
            <DetailRow label="Claim ID" value={compactId(claim.id)} />
            {isAdminView ? (
              <DetailRow label="Uploaded By" value={uploaderLabel} />
            ) : null}
            <DetailRow
              label="Category"
              value={<span className="capitalize">{claim.expenseCategory}</span>}
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
  );
}

export function ClaimReceiptFileCard({
  receiptLoading,
  onViewReceipt,
}: {
  receiptLoading: boolean;
  onViewReceipt: () => void;
}) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardTitle className="text-lg">Receipt File</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Open the original uploaded receipt in a separate tab for full-size
          inspection.
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        <Button
          variant="outline"
          disabled={receiptLoading}
          onClick={onViewReceipt}
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
  );
}
