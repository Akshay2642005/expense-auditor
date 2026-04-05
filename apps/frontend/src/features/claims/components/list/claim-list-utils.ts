import type { ElementType } from "react";

import type {
  AdminClaimDateField,
  AdminClaimSortBy,
  AdminClaimSortDir,
  ClaimResponse,
  ClaimStatus,
} from "@auditor/zod";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

export type ClaimDateField = AdminClaimDateField;
export type ClaimsPageRouteMode = "member" | "admin";

export type UploaderOption = {
  userId: string;
  label: string;
};

export const statusIcon: Record<string, ElementType> = {
  pending: Clock,
  processing: RefreshCw,
  ocr_complete: Clock,
  policy_matched: ShieldCheck,
  needs_review: AlertTriangle,
  ocr_failed: XCircle,
  auditing: RefreshCw,
  approved: CheckCircle2,
  flagged: AlertTriangle,
  rejected: XCircle,
};

export const statusDot: Record<string, string> = {
  approved: "bg-green-500",
  rejected: "bg-destructive",
  flagged: "bg-amber-500",
  needs_review: "bg-amber-500",
  ocr_failed: "bg-destructive",
  policy_matched: "bg-emerald-500",
  pending: "bg-muted-foreground/40",
  processing: "bg-blue-500",
  ocr_complete: "bg-primary",
  auditing: "bg-blue-500",
};

export const statusTextColor: Record<string, string> = {
  approved: "text-green-600 dark:text-green-400",
  rejected: "text-destructive",
  flagged: "text-amber-600 dark:text-amber-400",
  needs_review: "text-amber-600 dark:text-amber-400",
  ocr_failed: "text-destructive",
  policy_matched: "text-emerald-600 dark:text-emerald-400",
  pending: "text-muted-foreground",
  processing: "text-blue-600 dark:text-blue-400",
  ocr_complete: "text-primary",
  auditing: "text-blue-600 dark:text-blue-400",
};

export const auditDecisionColor: Record<string, string> = {
  approved: "text-green-600 dark:text-green-400",
  flagged: "text-amber-600 dark:text-amber-400",
  rejected: "text-destructive",
};

export const claimStatusLabel: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  ocr_complete: "OCR Complete",
  policy_matched: "Policy Matched",
  needs_review: "Needs Review",
  ocr_failed: "OCR Failed",
  auditing: "Auditing",
  approved: "Approved",
  flagged: "Flagged",
  rejected: "Rejected",
};

export const adminStatusFilterOptions: ClaimStatus[] = [
  "flagged",
  "needs_review",
  "ocr_failed",
  "pending",
  "processing",
  "ocr_complete",
  "policy_matched",
  "auditing",
  "approved",
  "rejected",
];

export function initials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export function formatClaimStatus(status: string) {
  return claimStatusLabel[status] ?? status.replace(/_/g, " ");
}

export function parseClaimDateValue(value: string, dateField: ClaimDateField) {
  if (dateField === "submitted") {
    return new Date(value);
  }

  return new Date(`${value}T00:00:00`);
}

export function formatClaimDate(value: string, dateField: ClaimDateField) {
  return parseClaimDateValue(value, dateField).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getClaimDateValue(
  claim: ClaimResponse,
  dateField: ClaimDateField,
) {
  return dateField === "submitted" ? claim.createdAt : claim.claimedDate;
}

export function getClaimDateKey(claim: ClaimResponse, dateField: ClaimDateField) {
  if (dateField === "claimed") {
    return claim.claimedDate;
  }

  const date = new Date(claim.createdAt);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

export function getClaimSummaryText(claim: ClaimResponse) {
  return claim.merchantName ?? claim.businessPurpose ?? "";
}

export function getClaimSearchableText(claim: ClaimResponse) {
  return [
    claim.id,
    claim.merchantName,
    claim.businessPurpose,
    claim.ocrError,
    claim.expenseCategory,
    claim.currency,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function compareAdminClaims(
  left: ClaimResponse,
  right: ClaimResponse,
  sortBy: AdminClaimSortBy,
  sortDir: AdminClaimSortDir,
) {
  const direction = sortDir === "asc" ? 1 : -1;

  let comparison = 0;
  if (sortBy === "claimedDate") {
    comparison = left.claimedDate.localeCompare(right.claimedDate);
  } else if (sortBy === "amount") {
    comparison = (left.amount ?? 0) - (right.amount ?? 0);
  } else if (sortBy === "status") {
    comparison = left.status.localeCompare(right.status);
  } else if (sortBy === "merchant") {
    comparison = getClaimSummaryText(left).localeCompare(
      getClaimSummaryText(right),
    );
  } else {
    comparison = left.createdAt.localeCompare(right.createdAt);
  }

  if (comparison !== 0) {
    return comparison * direction;
  }

  return left.id.localeCompare(right.id) * direction;
}
