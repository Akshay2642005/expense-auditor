import { useAuditApi } from "@/api/audit";
import { useClaimsApi } from "@/api/claims";
import { useOrganizationApi } from "@/api/organization";
import { usePolicyApi } from "@/api/policy";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenuCheckboxItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_URL } from "@/config/env";
import { useActiveOrganizationReady } from "@/hooks/useActiveOrganizationReady";
import {
  formatOrganizationMemberLabel,
  type OrganizationMemberDirectoryEntry,
  useOrganizationMemberDirectory,
} from "@/hooks/useOrganizationMemberDirectory";
import { cn } from "@/lib/utils";
import type {
  AdminClaimDateField,
  AdminClaimFlagFilter,
  AdminClaimSortBy,
  AdminClaimSortDir,
  AuditResponse,
  ClaimResponse,
  ClaimStatus,
} from "@auditor/zod";
import {
  useAuth,
  useClerk,
  useOrganization,
  useUser,
} from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Plus,
  RefreshCw,
  Receipt,
  LogOut,
  Search,
  SlidersHorizontal,
  FilterX,
  User,
  Users,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

// ─── status meta ──────────────────────────────────────────────────────────────

const statusIcon: Record<string, React.ElementType> = {
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

const statusDot: Record<string, string> = {
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

const statusTextColor: Record<string, string> = {
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

const auditDecisionColor: Record<string, string> = {
  approved: "text-green-600 dark:text-green-400",
  flagged: "text-amber-600 dark:text-amber-400",
  rejected: "text-destructive",
};

const claimStatusLabel: Record<string, string> = {
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

const adminStatusFilterOptions: ClaimStatus[] = [
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

type ClaimDateField = AdminClaimDateField;
type UploaderOption = {
  userId: string;
  label: string;
};

const ADMIN_SIDEBAR_STORAGE_KEY = "expense-auditor-admin-claims-sidebar-width";
const ADMIN_SIDEBAR_DEFAULT_WIDTH = 312;
const ADMIN_SIDEBAR_MIN_WIDTH = 280;
const ADMIN_SIDEBAR_MAX_WIDTH = 420;

// ─── helpers ──────────────────────────────────────────────────────────────────

function initials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function formatClaimStatus(status: string) {
  return claimStatusLabel[status] ?? status.replace(/_/g, " ");
}

function clampAdminSidebarWidth(width: number) {
  return Math.min(
    ADMIN_SIDEBAR_MAX_WIDTH,
    Math.max(ADMIN_SIDEBAR_MIN_WIDTH, width),
  );
}

function getInitialAdminSidebarWidth() {
  if (typeof window === "undefined") {
    return ADMIN_SIDEBAR_DEFAULT_WIDTH;
  }

  const storedWidth = window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY);
  if (!storedWidth) {
    return ADMIN_SIDEBAR_DEFAULT_WIDTH;
  }

  const parsedWidth = Number.parseInt(storedWidth, 10);
  if (Number.isNaN(parsedWidth)) {
    return ADMIN_SIDEBAR_DEFAULT_WIDTH;
  }

  return clampAdminSidebarWidth(parsedWidth);
}

function parseClaimDateValue(value: string, dateField: ClaimDateField) {
  if (dateField === "submitted") {
    return new Date(value);
  }

  return new Date(`${value}T00:00:00`);
}

function formatClaimDate(value: string, dateField: ClaimDateField) {
  return parseClaimDateValue(value, dateField).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getClaimDateValue(claim: ClaimResponse, dateField: ClaimDateField) {
  return dateField === "submitted" ? claim.createdAt : claim.claimedDate;
}

function getClaimDateKey(claim: ClaimResponse, dateField: ClaimDateField) {
  if (dateField === "claimed") {
    return claim.claimedDate;
  }

  const date = new Date(claim.createdAt);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function getClaimSummaryText(claim: ClaimResponse) {
  return claim.merchantName ?? claim.businessPurpose ?? "";
}

function getClaimSearchableText(claim: ClaimResponse) {
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

function compareAdminClaims(
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

async function fetchClaims(token: string): Promise<ClaimResponse[]> {
  const { data } = await axios.get<ClaimResponse[]>(
    `${API_URL}/api/v1/claims`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return data;
}

async function fetchClaim(id: string, token: string): Promise<ClaimResponse> {
  const { data } = await axios.get<ClaimResponse>(
    `${API_URL}/api/v1/claims/${id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return data;
}

/** Resolves a non-null Clerk token. Only called when authLoaded=true so retries are short. */
async function resolveToken(
  getToken: () => Promise<string | null>,
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const t = await getToken();
    if (t) return t;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Auth token unavailable");
}

// ─── Claim preview popover ────────────────────────────────────────────────────

const HOVER_DELAY_MS = 600;

function ClaimPreview({
  claim,
  anchorRect,
  uploaderLabel,
  dateField,
}: {
  claim: ClaimResponse;
  anchorRect: DOMRect;
  uploaderLabel?: string;
  dateField: ClaimDateField;
}) {
  const { getToken } = useAuth();
  const { getAudit } = useAuditApi();

  const { data: detail } = useQuery({
    queryKey: ["claim", claim.id],
    queryFn: async () => {
      const token = await resolveToken(getToken);
      return fetchClaim(claim.id, token);
    },
    staleTime: 5 * 60 * 1000,
    initialData: claim,
  });

  const isAudited = ["approved", "flagged", "rejected"].includes(claim.status);
  const { data: audit } = useQuery<AuditResponse | null>({
    queryKey: ["audit", claim.id],
    queryFn: ({ signal }) => getAudit(claim.id, signal),
    enabled: isAudited,
    staleTime: 5 * 60 * 1000,
  });

  const d = detail ?? claim;
  const dotColor = statusDot[d.status] ?? "bg-muted-foreground/40";
  const textColor = statusTextColor[d.status] ?? "text-muted-foreground";

  // Position relative to viewport (fixed positioning).
  // anchorRect is already viewport-relative from getBoundingClientRect().
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const previewW = 288; // w-72
  const previewH = 320; // estimated max height
  const gap = 8;

  const spaceRight = viewportW - anchorRect.right - gap;
  const left =
    spaceRight >= previewW
      ? anchorRect.right + gap
      : anchorRect.left - previewW - gap;

  // Align top of popover with top of row, clamped so it doesn't overflow viewport bottom
  const top = Math.min(anchorRect.top, viewportH - previewH - gap);

  return (
    <div
      className="fixed z-50 w-72 rounded-xl border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ left, top }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <div className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", dotColor)} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-sm">
            {d.merchantName ?? d.businessPurpose ?? "—"}
          </p>
          <p className={cn("text-xs capitalize", textColor)}>
            {formatClaimStatus(d.status)}
          </p>
        </div>
        {d.amount != null && (
          <span className="shrink-0 font-bold text-sm tabular-nums">
            {d.currency ?? ""} {Number(d.amount).toFixed(2)}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="space-y-2 px-4 py-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Category</span>
          <span className="capitalize font-medium">{d.expenseCategory}</span>
        </div>
        {uploaderLabel && (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Uploaded by</span>
            <span className="truncate text-right font-medium">
              {uploaderLabel}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {dateField === "submitted" ? "Submitted" : "Claimed"}
          </span>
          <span className="font-medium">
            {formatClaimDate(getClaimDateValue(d, dateField), dateField)}
          </span>
        </div>
        {d.businessPurpose && (
          <div className="pt-1">
            <p className="text-muted-foreground mb-0.5">Purpose</p>
            <p className="line-clamp-2 leading-relaxed">{d.businessPurpose}</p>
          </div>
        )}

        {audit && (
          <div className="mt-2 rounded-lg border bg-muted/50 p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">AI Decision</span>
              <span
                className={cn(
                  "font-semibold capitalize",
                  auditDecisionColor[audit.decision],
                )}
              >
                {audit.decision}
              </span>
            </div>
            <p className="line-clamp-3 text-muted-foreground leading-relaxed">
              {audit.reason}
            </p>
            <div className="flex justify-between pt-0.5 text-muted-foreground/70">
              <span>Confidence</span>
              <span>{Math.round((audit.confidence ?? 0) * 100)}%</span>
            </div>
          </div>
        )}

        {isAudited && !audit && (
          <div className="flex items-center gap-1.5 text-muted-foreground pt-1">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Loading audit…</span>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-2">
        <p className="text-[11px] text-muted-foreground">
          Click to view full details
        </p>
      </div>
    </div>
  );
}

// ─── Claim row ────────────────────────────────────────────────────────────────

function ClaimRow({
  claim,
  onClick,
  isAdminView,
  uploaderLabel,
  dateField,
}: {
  claim: ClaimResponse;
  onClick: () => void;
  isAdminView: boolean;
  uploaderLabel?: string;
  dateField: ClaimDateField;
}) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { getAudit } = useAuditApi();

  const [preview, setPreview] = useState<{ rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const StatusIcon = statusIcon[claim.status] ?? Clock;
  const dotColor = statusDot[claim.status] ?? "bg-muted-foreground/40";
  const textColor = statusTextColor[claim.status] ?? "text-muted-foreground";
  const isAudited = ["approved", "flagged", "rejected"].includes(claim.status);

  // Prefetch claim detail + audit into cache on hover start (before preview shows)
  const prefetch = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: ["claim", claim.id],
      queryFn: async () => {
        const token = await resolveToken(getToken);
        return fetchClaim(claim.id, token);
      },
      staleTime: 5 * 60 * 1000,
    });
    if (isAudited) {
      queryClient.prefetchQuery({
        queryKey: ["audit", claim.id],
        queryFn: ({ signal }) => getAudit(claim.id, signal),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [claim.id, isAudited, queryClient, getToken, getAudit]);

  const handleMouseEnter = () => {
    prefetch();
    hoverTimer.current = setTimeout(() => {
      if (rowRef.current) {
        setPreview({ rect: rowRef.current.getBoundingClientRect() });
      }
    }, HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setPreview(null);
  };

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );

  return (
    <>
      <div
        ref={rowRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="group flex cursor-pointer items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-all hover:bg-accent/50 hover:shadow-sm active:scale-[0.995]"
      >
        {/* Status dot */}
        <div className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)} />

        {/* Claim summary */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {claim.merchantName ?? claim.businessPurpose ?? "—"}
          </p>
          <p
            className={cn(
              "truncate text-xs text-muted-foreground",
              !isAdminView && "capitalize",
            )}
          >
            {isAdminView
              ? `Uploaded by ${uploaderLabel ?? claim.userId}`
              : claim.expenseCategory}
          </p>
          {isAdminView && (
            <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground/60">
              {claim.expenseCategory}
            </p>
          )}
        </div>

        {/* Date */}
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {formatClaimDate(getClaimDateValue(claim, dateField), dateField)}
        </span>

        {/* Amount */}
        {claim.amount != null ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {claim.currency ?? ""} {Number(claim.amount).toFixed(2)}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">—</span>
        )}

        {/* Status badge */}
        <Badge
          variant="outline"
          className={cn(
            "hidden shrink-0 text-[11px] capitalize sm:flex",
            textColor,
          )}
        >
          <StatusIcon className="mr-1 h-3 w-3" />
          {formatClaimStatus(claim.status)}
        </Badge>

        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
      </div>

      {preview && (
        <ClaimPreview
          claim={claim}
          anchorRect={preview.rect}
          uploaderLabel={
            isAdminView ? (uploaderLabel ?? claim.userId) : undefined
          }
          dateField={dateField}
        />
      )}
    </>
  );
}

function AdminFiltersPanel({
  adminSearchText,
  setAdminSearchText,
  statusFilterLabel,
  selectedStatuses,
  toggleStatusFilter,
  selectedUploaderUserId,
  setSelectedUploaderUserId,
  uploaderOptions,
  flaggedFilter,
  setFlaggedFilter,
  activeFilterCount,
  clearAdminFilters,
  dateField,
  setDateField,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  isDesktopSidebar = false,
}: {
  adminSearchText: string;
  setAdminSearchText: (value: string) => void;
  statusFilterLabel: string;
  selectedStatuses: ClaimStatus[];
  toggleStatusFilter: (status: ClaimStatus) => void;
  selectedUploaderUserId: string;
  setSelectedUploaderUserId: (value: string) => void;
  uploaderOptions: UploaderOption[];
  flaggedFilter: AdminClaimFlagFilter;
  setFlaggedFilter: (value: AdminClaimFlagFilter) => void;
  activeFilterCount: number;
  clearAdminFilters: () => void;
  dateField: AdminClaimDateField;
  setDateField: (value: AdminClaimDateField) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
  sortBy: AdminClaimSortBy;
  setSortBy: (value: AdminClaimSortBy) => void;
  sortDir: AdminClaimSortDir;
  setSortDir: (value: AdminClaimSortDir) => void;
  isDesktopSidebar?: boolean;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-border/70 bg-card/70 shadow-sm backdrop-blur-sm",
        isDesktopSidebar && "max-h-[calc(100vh-8.5rem)]",
      )}
    >
      <CardContent className="flex flex-col px-0 py-0">
        <div className="px-4 pb-3 pt-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Review Filters</p>
              {activeFilterCount > 0 && (
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="rounded-full px-2 py-0.5 text-[11px]"
                  >
                    {activeFilterCount}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={clearAdminFilters}
                  >
                    <FilterX className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Search the queue and tighten the results.
            </p>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label
              htmlFor="admin-claim-search"
              className="text-xs text-muted-foreground"
            >
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-claim-search"
                value={adminSearchText}
                onChange={(event) => setAdminSearchText(event.target.value)}
                placeholder="Merchant, purpose, OCR note, or claim ID"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div
          className={cn(
            "space-y-4 px-4 pb-3 pt-2",
            isDesktopSidebar && "overflow-y-auto",
          )}
        >
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between gap-2"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{statusFilterLabel}</span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {adminStatusFilterOptions.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={selectedStatuses.includes(status)}
                    onCheckedChange={() => toggleStatusFilter(status)}
                  >
                    {formatClaimStatus(status)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Uploader</Label>
            <Select
              value={selectedUploaderUserId || "all"}
              onValueChange={(value) =>
                setSelectedUploaderUserId(value === "all" ? "" : value)
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="All uploaders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All uploaders</SelectItem>
                {uploaderOptions.map((option) => (
                  <SelectItem key={option.userId} value={option.userId}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Flagged</Label>
              <Select
                value={flaggedFilter}
                onValueChange={(value: AdminClaimFlagFilter) =>
                  setFlaggedFilter(value)
                }
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="Flagged filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All claims</SelectItem>
                  <SelectItem value="flagged">Flagged only</SelectItem>
                  <SelectItem value="unflagged">Exclude flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Date field
              </Label>
              <Select
                value={dateField}
                onValueChange={(value: AdminClaimDateField) =>
                  setDateField(value)
                }
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Submitted date</SelectItem>
                  <SelectItem value="claimed">Claimed date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Sort by</Label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem] lg:grid-cols-1">
              <Select
                value={sortBy}
                onValueChange={(value: AdminClaimSortBy) => setSortBy(value)}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submittedDate">Submitted date</SelectItem>
                  <SelectItem value="claimedDate">Claimed date</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="merchant">Merchant</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sortDir}
                onValueChange={(value: AdminClaimSortDir) => setSortDir(value)}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Descending</SelectItem>
                  <SelectItem value="asc">Ascending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ClaimsListPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken, orgRole, isLoaded: authLoaded, isSignedIn } = useAuth();
  const { organization } = useOrganization();
  const { signOut } = useClerk();
  const { listAdminClaims } = useClaimsApi();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [adminSearchText, setAdminSearchText] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<ClaimStatus[]>([]);
  const [selectedUploaderUserId, setSelectedUploaderUserId] = useState("");
  const [flaggedFilter, setFlaggedFilter] =
    useState<AdminClaimFlagFilter>("all");
  const [dateField, setDateField] = useState<AdminClaimDateField>("submitted");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<AdminClaimSortBy>("submittedDate");
  const [sortDir, setSortDir] = useState<AdminClaimSortDir>("desc");
  const [adminSidebarWidth, setAdminSidebarWidth] = useState(
    getInitialAdminSidebarWidth,
  );
  const { getActivePolicy } = usePolicyApi();
  const { createInvitation } = useOrganizationApi();
  const {
    orgId: activeOrgId,
    isReady: isActiveOrgReady,
    isWaitingForActivation: isWaitingForActiveOrg,
  } = useActiveOrganizationReady();
  const isAdminView = orgRole === "org:admin";
  const { memberDirectory } = useOrganizationMemberDirectory(isAdminView);
  const deferredAdminSearchText = useDeferredValue(adminSearchText.trim());

  // Only fire queries once Clerk has fully loaded and confirmed the user is signed in.
  // resolveToken retries up to 5× with 200ms gaps, covering the brief window after
  // refresh where isLoaded=true but the JWT isn't minted yet.
  const queryEnabled = authLoaded && isSignedIn === true;
  const claimsQueryEnabled = queryEnabled && !isWaitingForActiveOrg;

  const {
    data: claims,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["claims", isAdminView ? "admin" : "member"],
    queryFn: async () => {
      if (isAdminView) {
        return listAdminClaims();
      }

      const token = await resolveToken(getToken);
      return fetchClaims(token);
    },
    enabled: claimsQueryEnabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const { data: activePolicy } = useQuery({
    queryKey: ["policy", "active", activeOrgId ?? "no-active-org"],
    queryFn: getActivePolicy,
    enabled: queryEnabled && isActiveOrgReady,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const rawClaims = claims ?? [];
  const claimList = isAdminView
    ? rawClaims
        .filter((claim) => {
          if (deferredAdminSearchText) {
            const normalizedQuery = deferredAdminSearchText.toLocaleLowerCase();
            if (!getClaimSearchableText(claim).includes(normalizedQuery)) {
              return false;
            }
          }

          if (
            selectedStatuses.length > 0 &&
            !selectedStatuses.includes(claim.status)
          ) {
            return false;
          }

          if (
            selectedUploaderUserId &&
            claim.userId !== selectedUploaderUserId
          ) {
            return false;
          }

          if (flaggedFilter === "flagged" && claim.status !== "flagged") {
            return false;
          }
          if (flaggedFilter === "unflagged" && claim.status === "flagged") {
            return false;
          }

          const claimDateKey = getClaimDateKey(claim, dateField);
          if (dateFrom && claimDateKey < dateFrom) {
            return false;
          }
          if (dateTo && claimDateKey > dateTo) {
            return false;
          }

          return true;
        })
        .toSorted((left, right) =>
          compareAdminClaims(left, right, sortBy, sortDir),
        )
    : rawClaims;
  const filteredClaimCount = claimList.length;

  const uploaderOptions = Object.entries(memberDirectory)
    .filter(([userId, member]) => {
      if (!member) return false;
      if (userId === user?.id) return false;
      return member.role === "org:member";
    })
    .map(([userId, member]) => ({
      userId,
      label: formatOrganizationMemberLabel(member, userId),
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label));

  let activeFilterCount = 0;
  if (adminSearchText.trim()) activeFilterCount += 1;
  if (selectedStatuses.length > 0) activeFilterCount += 1;
  if (selectedUploaderUserId) activeFilterCount += 1;
  if (flaggedFilter !== "all") activeFilterCount += 1;
  if (dateField !== "submitted") activeFilterCount += 1;
  if (dateFrom) activeFilterCount += 1;
  if (dateTo) activeFilterCount += 1;
  if (sortBy !== "submittedDate") activeFilterCount += 1;
  if (sortDir !== "desc") activeFilterCount += 1;

  const adminDateColumnLabel =
    dateField === "submitted" ? "Submitted" : "Claimed";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await createInvitation({
        emailAddress: inviteEmail.trim(),
        role: "org:member",
      });
      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteOpen(false);
    } catch {
      toast.error("Failed to send invite.");
    } finally {
      setInviting(false);
    }
  };

  const toggleStatusFilter = (status: ClaimStatus) => {
    setSelectedStatuses((currentStatuses) =>
      currentStatuses.includes(status)
        ? currentStatuses.filter((currentStatus) => currentStatus !== status)
        : [...currentStatuses, status],
    );
  };

  const clearAdminFilters = () => {
    setAdminSearchText("");
    setSelectedStatuses([]);
    setSelectedUploaderUserId("");
    setFlaggedFilter("all");
    setDateField("submitted");
    setDateFrom("");
    setDateTo("");
    setSortBy("submittedDate");
    setSortDir("desc");
  };

  const statusFilterLabel =
    selectedStatuses.length === 0
      ? "All statuses"
      : selectedStatuses.length === 1
        ? formatClaimStatus(selectedStatuses[0])
        : `${selectedStatuses.length} statuses`;

  const policyPath = orgRole === "org:admin" ? "/admin/policy" : "/policy";
  const policyLabel = orgRole === "org:admin" ? "Policy Admin" : "Policy";
  const claimsHeading = isAdminView ? "Claims To Review" : "My Claims";
  const claimsEmptyTitle = isAdminView
    ? activeFilterCount > 0
      ? "No claims match those filters"
      : "No member claims yet"
    : "No claims yet";
  const claimsEmptyBody = isAdminView
    ? activeFilterCount > 0
      ? "Try broadening your search, date range, or status filters."
      : "When team members submit expenses, they will appear here for review."
    : "Submit your first expense claim to get started.";
  const isInitialLoading =
    !authLoaded ||
    isWaitingForActiveOrg ||
    (isLoading && rawClaims.length === 0);
  const pageShellWidthClassName = isAdminView ? "max-w-7xl" : "max-w-3xl";

  useEffect(() => {
    if (!isAdminView || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      ADMIN_SIDEBAR_STORAGE_KEY,
      String(adminSidebarWidth),
    );
  }, [adminSidebarWidth, isAdminView]);

  const claimsContent = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{claimsHeading}</h2>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
          )}
          {filteredClaimCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {isAdminView && activeFilterCount > 0
                ? `${filteredClaimCount} of ${rawClaims.length}`
                : filteredClaimCount}{" "}
              {filteredClaimCount === 1 ? "claim" : "claims"}
            </span>
          )}
        </div>
      </div>

      {filteredClaimCount > 0 && (
        <div className="mb-2 flex items-center gap-4 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
          <div className="w-2 shrink-0" />
          <span className="flex-1">
            {isAdminView ? "Claim / Uploader" : "Merchant"}
          </span>
          <span className="hidden w-24 text-right sm:block">
            {isAdminView ? adminDateColumnLabel : "Claimed"}
          </span>
          <span className="w-20 text-right">Amount</span>
          <span className="hidden w-24 text-right sm:block">Status</span>
          <div className="w-3.5 shrink-0" />
        </div>
      )}

      {isInitialLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredClaimCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">{claimsEmptyTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {claimsEmptyBody}
              </p>
            </div>
            {!isAdminView && (
              <Button onClick={() => navigate("/claims/new")}>
                <Plus className="mr-1.5 h-4 w-4" />
                Submit Expense
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {claimList.map((claim) => {
            const uploaderLabel = formatOrganizationMemberLabel(
              memberDirectory[claim.userId],
              claim.userId,
            );

            return (
              <ClaimRow
                key={claim.id}
                claim={claim}
                isAdminView={isAdminView}
                dateField={isAdminView ? dateField : "claimed"}
                onClick={() => navigate(`/claims/${claim.id}`)}
                uploaderLabel={isAdminView ? uploaderLabel : undefined}
              />
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div
          className={cn(
            "mx-auto flex items-center justify-between px-4 py-3",
            pageShellWidthClassName,
          )}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Receipt className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Expense Auditor
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate(policyPath)}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{policyLabel}</span>
            </Button>

            {!isAdminView && (
              <Button size="sm" onClick={() => navigate("/claims/new")}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Claim
              </Button>
            )}

            <ThemeToggle />

            {orgRole === "org:admin" && (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Invite</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Invite team member</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleInvite} className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-email">Email address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        required
                        disabled={inviting}
                        autoFocus
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={inviting || !inviteEmail.trim()}
                    >
                      {inviting ? "Sending…" : "Send invite"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Account menu"
                >
                  <Avatar className="h-8 w-8 cursor-pointer">
                    <AvatarImage
                      src={user?.imageUrl}
                      alt={user?.fullName ?? ""}
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                      {initials(user?.firstName, user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="truncate text-sm font-medium leading-none">
                      {user?.fullName}
                    </p>
                    <p className="truncate text-xs leading-none text-muted-foreground">
                      {user?.primaryEmailAddress?.emailAddress}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className={cn("mx-auto px-4 py-8", pageShellWidthClassName)}>
        {/* Active policy banner */}
        {isWaitingForActiveOrg ? (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading your organization policy…
          </div>
        ) : (
          activePolicy && (
            <button
              onClick={() => navigate(policyPath)}
              className="mb-6 flex w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-left transition-colors hover:bg-emerald-500/10"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300/80">
                  Active policy
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {activePolicy.name}
                  </span>
                  {activePolicy.version && (
                    <span className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                      Policy number{" "}
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                        {activePolicy.version}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                View policy →
              </span>
            </button>
          )
        )}

        {isAdminView && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <p className="font-medium text-foreground">Admin review mode</p>
              <p className="mt-1 text-muted-foreground">
                Admin accounts can review member claims, but they cannot submit
                expenses.
              </p>
            </div>
          </div>
        )}

        {isAdminView ? (
          <>
            <div className="mb-6 lg:hidden">
              <AdminFiltersPanel
                adminSearchText={adminSearchText}
                setAdminSearchText={setAdminSearchText}
                statusFilterLabel={statusFilterLabel}
                selectedStatuses={selectedStatuses}
                toggleStatusFilter={toggleStatusFilter}
                selectedUploaderUserId={selectedUploaderUserId}
                setSelectedUploaderUserId={setSelectedUploaderUserId}
                uploaderOptions={uploaderOptions}
                flaggedFilter={flaggedFilter}
                setFlaggedFilter={setFlaggedFilter}
                activeFilterCount={activeFilterCount}
                clearAdminFilters={clearAdminFilters}
                dateField={dateField}
                setDateField={setDateField}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortDir={sortDir}
                setSortDir={setSortDir}
              />
            </div>

            <div className="hidden lg:block">
              <div className="flex min-h-[42rem] items-start">
                <div
                  className="shrink-0"
                  style={{ width: `${adminSidebarWidth}px` }}
                >
                  <div className="pr-4">
                    <AdminFiltersPanel
                      adminSearchText={adminSearchText}
                      setAdminSearchText={setAdminSearchText}
                      statusFilterLabel={statusFilterLabel}
                      selectedStatuses={selectedStatuses}
                      toggleStatusFilter={toggleStatusFilter}
                      selectedUploaderUserId={selectedUploaderUserId}
                      setSelectedUploaderUserId={setSelectedUploaderUserId}
                      uploaderOptions={uploaderOptions}
                      flaggedFilter={flaggedFilter}
                      setFlaggedFilter={setFlaggedFilter}
                      activeFilterCount={activeFilterCount}
                      clearAdminFilters={clearAdminFilters}
                      dateField={dateField}
                      setDateField={setDateField}
                      dateFrom={dateFrom}
                      setDateFrom={setDateFrom}
                      dateTo={dateTo}
                      setDateTo={setDateTo}
                      sortBy={sortBy}
                      setSortBy={setSortBy}
                      sortDir={sortDir}
                      setSortDir={setSortDir}
                      isDesktopSidebar
                    />
                  </div>
                </div>

                <div className="min-w-0 flex-1 pl-3">
                  <section className="rounded-2xl border border-border/40 bg-card/[0.03] px-5 py-5">
                    {claimsContent}
                  </section>
                </div>
              </div>
            </div>

            <div className="lg:hidden">{claimsContent}</div>
          </>
        ) : (
          claimsContent
        )}
      </main>
    </div>
  );
}
