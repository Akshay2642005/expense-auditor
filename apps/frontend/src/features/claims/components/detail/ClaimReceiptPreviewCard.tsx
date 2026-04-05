import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Eye, RefreshCw } from "lucide-react";

export function ClaimReceiptPreviewCard({
  receiptLoading,
  isReceiptPreviewLoading,
  isReceiptPreviewError,
  receiptPreviewUrl,
  canInlineReceiptPreview,
  receiptPreviewMimeType,
  onViewReceipt,
  onDownloadReceipt,
}: {
  receiptLoading: boolean;
  isReceiptPreviewLoading: boolean;
  isReceiptPreviewError: boolean;
  receiptPreviewUrl: string | null;
  canInlineReceiptPreview: boolean;
  receiptPreviewMimeType: string;
  onViewReceipt: () => void;
  onDownloadReceipt: () => void;
}) {
  return (
    <Card className="flex-1 self-start overflow-hidden border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Receipt Preview</CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Inspect the uploaded file inline while reviewing the extracted
              data, policy evidence, and override history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onViewReceipt}
              disabled={receiptLoading}
              className="gap-2"
            >
              {receiptLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Open full receipt
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadReceipt}
              disabled={receiptLoading}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {isReceiptPreviewLoading ? (
          <div className="flex h-[clamp(28rem,68vh,52rem)] items-center justify-center rounded-2xl border border-border/60 bg-muted/20 text-sm text-muted-foreground">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading receipt preview…
          </div>
        ) : isReceiptPreviewError ? (
          <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            The receipt preview could not be loaded inline. You can still open
            or download the original file above.
          </div>
        ) : receiptPreviewUrl && canInlineReceiptPreview ? (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
            {receiptPreviewMimeType === "application/pdf" ? (
              <iframe
                title="Receipt preview"
                src={receiptPreviewUrl}
                className="h-[clamp(28rem,68vh,52rem)] w-full bg-background"
              />
            ) : (
              <div className="flex justify-center bg-background/60 p-3">
                <img
                  src={receiptPreviewUrl}
                  alt="Uploaded receipt preview"
                  className="max-h-[clamp(28rem,68vh,52rem)] w-full rounded-xl object-contain"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            Inline preview is not available for this file type yet. Use the
            actions above to inspect the original receipt.
          </div>
        )}
      </CardContent>

    </Card>
  );
}
