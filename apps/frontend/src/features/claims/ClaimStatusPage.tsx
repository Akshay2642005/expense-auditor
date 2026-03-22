import { useAuth } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  AlertCircle, CheckCircle2, Clock, Eye,
  RefreshCw, AlertTriangle, XCircle, FileText,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { API_URL } from "@/config/env";
import type { ClaimResponse } from "@auditor/zod";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 3_000;
const TERMINAL_STATUSES = new Set([
  "ocr_complete", "needs_review", "ocr_failed",
  "auditing", "approved", "flagged", "rejected",
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
  pending: { label: "Pending", icon: Clock, variant: "secondary", color: "text-muted-foreground" },
  processing: { label: "Processing", icon: RefreshCw, variant: "secondary", color: "text-blue-600 dark:text-blue-400" },
  ocr_complete: { label: "Under Review", icon: Eye, variant: "default", color: "text-primary" },
  needs_review: { label: "Needs Review", icon: AlertTriangle, variant: "outline", color: "text-amber-600 dark:text-amber-400" },
  ocr_failed: { label: "OCR Failed", icon: AlertCircle, variant: "destructive", color: "text-destructive" },
  auditing: { label: "Auditing", icon: Eye, variant: "secondary", color: "text-blue-600" },
  approved: { label: "Approved", icon: CheckCircle2, variant: "default", color: "text-green-600 dark:text-green-400" },
  flagged: { label: "Flagged", icon: AlertTriangle, variant: "outline", color: "text-amber-600" },
  rejected: { label: "Rejected", icon: XCircle, variant: "destructive", color: "text-destructive" },
};

async function fetchClaim(id: string, token: string | null): Promise<ClaimResponse> {
  const resp = await axios.get<ClaimResponse>(`${API_URL}/api/v1/claims/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return resp.data;
}

export function ClaimStatusPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken, orgRole } = useAuth();
  const queryClient = useQueryClient();

  const [receiptLoading, setReceiptLoading] = useState(false);
  const [recomputeLoading, setRecomputeLoading] = useState(false);

  const { data: claim, isLoading, isError } = useQuery({
    queryKey: ["claim", id],
    queryFn: async () => {
      const token = await getToken();
      return fetchClaim(id!, token);
    },
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data && TERMINAL_STATUSES.has(query.state.data.status)
        ? false
        : POLL_INTERVAL_MS,
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [claim?.status]);

  // Authenticated receipt viewer — fetches with Bearer token, opens blob URL
  const handleViewReceipt = async () => {
    if (!claim) return;
    setReceiptLoading(true);
    try {
      const token = await getToken();
      const resp = await axios.get(`${API_URL}/api/v1/claims/${claim.id}/receipt`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        responseType: "blob",
      });

      const blobUrl = URL.createObjectURL(resp.data as Blob);
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
      const token = await getToken();
      await axios.post(
        `${API_URL}/api/v1/admin/claims/${claim.id}/recompute-policy`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      await queryClient.invalidateQueries({ queryKey: ["claim", id] });
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
            <Button variant="outline" onClick={() => navigate("/")}>
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

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">

        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          ← All Claims
        </Button>

        {/* Status banner */}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <div className={cn("rounded-full bg-muted p-3", cfg.color)}>
              <Icon className={cn("h-6 w-6", isLive && "animate-pulse")} />
            </div>
            <Badge variant={cfg.variant} className="px-3 py-1 text-sm">
              {cfg.label}
            </Badge>
            {isLive && (
              <p className="text-xs text-muted-foreground">Checking for updates…</p>
            )}
            {claim.ocrError && (
              <p className="max-w-sm rounded bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {claim.ocrError}
              </p>
            )}
          </CardContent>
        </Card>
        {orgRole === "org:admin" && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecomputePolicy}
              disabled={recomputeLoading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", recomputeLoading && "animate-spin")} />
              Re-run Policy Match
            </Button>
          </div>
        )}

        {/* Extracted receipt data */}
        {(claim.merchantName || claim.amount != null) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extracted from Receipt</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {claim.merchantName && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Merchant</dt>
                    <dd className="font-medium">{claim.merchantName}</dd>
                  </div>
                )}
                {claim.amount != null && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Amount</dt>
                    <dd className="font-medium">
                      {claim.currency ?? ""} {Number(claim.amount).toFixed(2)}
                    </dd>
                  </div>
                )}
                {claim.receiptDate && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Receipt Date</dt>
                    <dd className="font-medium">
                      {new Date(claim.receiptDate).toLocaleDateString()}
                    </dd>
                  </div>
                )}
                {claim.dateMismatch && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs">
                        Receipt date differs from your claimed date by more than the allowed threshold.
                      </span>
                    </div>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Claim metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Submission</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-medium capitalize">{claim.expenseCategory}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Claimed Date</dt>
                <dd className="font-medium">
                  {new Date(claim.claimedDate).toLocaleDateString()}
                </dd>
              </div>
              <Separator />
              <div>
                <dt className="mb-1 text-muted-foreground">Business Purpose</dt>
                <dd className="leading-relaxed">{claim.businessPurpose}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Receipt — authenticated blob download */}
        {!TERMINAL_STATUSES.has("pending") || TERMINAL_STATUSES.has(claim.status) ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receipt</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                disabled={receiptLoading}
                onClick={handleViewReceipt}
                className="gap-2"
              >
                {receiptLoading
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <FileText className="h-4 w-4" />}
                {receiptLoading ? "Loading…" : "View Receipt"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

      </div>
    </div>
  );
}
