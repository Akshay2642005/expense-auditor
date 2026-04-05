import type { OrganizationMemberDirectoryEntry } from "@/hooks/useOrganizationMemberDirectory";
import { formatOrganizationMemberLabel } from "@/hooks/useOrganizationMemberDirectory";
import type { AuditResponse } from "@auditor/zod";
import type { ElementType } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  RefreshCw,
  XCircle,
} from "lucide-react";

export type ExtendedAudit = AuditResponse &
  Partial<{
    messages: unknown[];
    explanation?: string;
    details?: unknown;
    deterministicRule?: string;
  }>;

export const POLL_INTERVAL_MS = 3_000;

export const TERMINAL_STATUSES = new Set([
  "ocr_complete",
  "needs_review",
  "ocr_failed",
  "policy_matched",
  "auditing",
  "approved",
  "flagged",
  "rejected",
]);

export const statusConfig: Record<
  string,
  {
    label: string;
    icon: ElementType;
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

export function getDecisionToneClass(status?: string) {
  return (
    decisionToneClasses[status ?? "pending"] ?? decisionToneClasses.pending
  );
}

export function getDecisionTextClass(status?: string) {
  return statusConfig[status ?? "pending"]?.color ?? "text-foreground";
}

export function formatClaimAmount(
  amount?: number | null,
  currency?: string | null,
) {
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

export function compactId(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function isManualAuditDecision(
  audit?: Pick<AuditResponse, "aiModel" | "overrideReason"> | null,
) {
  return audit?.aiModel === "human_override" || !!audit?.overrideReason;
}

export function formatAuditSourceLabel(
  audit: AuditResponse,
  memberDirectory: Record<string, OrganizationMemberDirectoryEntry>,
) {
  if (isManualAuditDecision(audit)) {
    return audit.overriddenBy
      ? formatOrganizationMemberLabel(
          memberDirectory[audit.overriddenBy],
          audit.overriddenBy,
        )
      : "Manual review";
  }

  return audit.aiModel || "AI audit";
}

export function formatAuditTimestamp(value?: string) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
}

export function getDownloadFilename(claimId: string, mimeType?: string) {
  switch (mimeType) {
    case "application/pdf":
      return `receipt-${claimId}.pdf`;
    case "image/png":
      return `receipt-${claimId}.png`;
    case "image/jpeg":
      return `receipt-${claimId}.jpg`;
    default:
      return `receipt-${claimId}`;
  }
}
