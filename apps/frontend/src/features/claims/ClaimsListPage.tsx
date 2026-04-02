import { useAuth, useClerk, useOrganization, useUser } from "@clerk/clerk-react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
  User,
  Users,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { API_URL } from "@/config/env";
import type { AuditResponse, ClaimResponse } from "@auditor/zod";
import { cn } from "@/lib/utils";
import { usePolicyApi } from "@/api/policy";
import { useAuditApi } from "@/api/audit";

// ─── status meta ──────────────────────────────────────────────────────────────

const statusIcon: Record<string, React.ElementType> = {
  pending: Clock,
  processing: RefreshCw,
  ocr_complete: Clock,
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

// ─── helpers ──────────────────────────────────────────────────────────────────

function initials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

async function fetchClaims(token: string): Promise<ClaimResponse[]> {
  const { data } = await axios.get<ClaimResponse[]>(`${API_URL}/api/v1/claims`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

async function fetchClaim(id: string, token: string): Promise<ClaimResponse> {
  const { data } = await axios.get<ClaimResponse>(`${API_URL}/api/v1/claims/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

/** Resolves a non-null Clerk token. Only called when authLoaded=true so retries are short. */
async function resolveToken(getToken: () => Promise<string | null>): Promise<string> {
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
}: {
  claim: ClaimResponse;
  anchorRect: DOMRect;
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
  const left = spaceRight >= previewW
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
            {d.status.replace(/_/g, " ")}
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
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date</span>
          <span className="font-medium">
            {new Date(d.claimedDate).toLocaleDateString(undefined, {
              year: "numeric", month: "short", day: "numeric",
            })}
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
              <span className={cn("font-semibold capitalize", auditDecisionColor[audit.decision])}>
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
        <p className="text-[11px] text-muted-foreground">Click to view full details</p>
      </div>
    </div>
  );
}

// ─── Claim row ────────────────────────────────────────────────────────────────

function ClaimRow({ claim, onClick }: { claim: ClaimResponse; onClick: () => void }) {
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

  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

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

        {/* Merchant + category */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {claim.merchantName ?? claim.businessPurpose ?? "—"}
          </p>
          <p className="truncate text-xs capitalize text-muted-foreground">
            {claim.expenseCategory}
          </p>
        </div>

        {/* Date */}
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {new Date(claim.claimedDate).toLocaleDateString(undefined, {
            month: "short", day: "numeric", year: "numeric",
          })}
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
          className={cn("hidden shrink-0 text-[11px] capitalize sm:flex", textColor)}
        >
          <StatusIcon className="mr-1 h-3 w-3" />
          {claim.status.replace(/_/g, " ")}
        </Badge>

        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
      </div>

      {preview && (
        <ClaimPreview claim={claim} anchorRect={preview.rect} />
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ClaimsListPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken, orgRole, isLoaded: authLoaded, isSignedIn } = useAuth();
  const { organization } = useOrganization();
  const { signOut } = useClerk();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { getActivePolicy } = usePolicyApi();

  // Only fire queries once Clerk has fully loaded and confirmed the user is signed in.
  // resolveToken retries up to 5× with 200ms gaps, covering the brief window after
  // refresh where isLoaded=true but the JWT isn't minted yet.
  const queryEnabled = authLoaded && isSignedIn === true;

  const { data: claims, isLoading, isFetching } = useQuery({
    queryKey: ["claims"],
    queryFn: async () => {
      const token = await resolveToken(getToken);
      return fetchClaims(token);
    },
    enabled: queryEnabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const { data: activePolicy } = useQuery({
    queryKey: ["policy", "active"],
    queryFn: getActivePolicy,
    enabled: queryEnabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const claimList = claims ?? [];

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await organization.inviteMember({ emailAddress: inviteEmail.trim(), role: "org:member" });
      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteOpen(false);
    } catch {
      toast.error("Failed to send invite.");
    } finally {
      setInviting(false);
    }
  };

  const policyPath = orgRole === "org:admin" ? "/admin/policy" : "/policy";
  const policyLabel = orgRole === "org:admin" ? "Policy Admin" : "Policy";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Receipt className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Expense Auditor</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(policyPath)}>
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{policyLabel}</span>
            </Button>

            <Button size="sm" onClick={() => navigate("/claims/new")}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Claim
            </Button>

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
                    <Button type="submit" className="w-full" disabled={inviting || !inviteEmail.trim()}>
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
                    <AvatarImage src={user?.imageUrl} alt={user?.fullName ?? ""} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                      {initials(user?.firstName, user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="truncate text-sm font-medium leading-none">{user?.fullName}</p>
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
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-8">

        {/* Active policy banner */}
        {activePolicy && (
          <button
            onClick={() => navigate(policyPath)}
            className="mb-6 flex w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-left transition-colors hover:bg-emerald-500/10"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <span className="truncate text-sm font-medium">{activePolicy.name}</span>
              {activePolicy.version && (
                <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                  {activePolicy.version}
                </span>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">View policy →</span>
          </button>
        )}

        {/* Claims header */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">My Claims</h2>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
            )}
            {claimList.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {claimList.length} {claimList.length === 1 ? "claim" : "claims"}
              </span>
            )}
          </div>
        </div>

        {/* Column labels */}
        {claimList.length > 0 && (
          <div className="mb-2 flex items-center gap-4 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
            <div className="w-2 shrink-0" />
            <span className="flex-1">Merchant</span>
            <span className="hidden sm:block w-24 text-right">Date</span>
            <span className="w-20 text-right">Amount</span>
            <span className="hidden sm:block w-24 text-right">Status</span>
            <div className="w-3.5 shrink-0" />
          </div>
        )}

        {/* Show spinner only on true initial load (no data yet + Clerk ready) */}
        {(!authLoaded || (isLoading && claimList.length === 0)) ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : claimList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No claims yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Submit your first expense claim to get started.
                </p>
              </div>
              <Button onClick={() => navigate("/claims/new")}>
                <Plus className="mr-1.5 h-4 w-4" />
                Submit Expense
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {claimList.map((claim) => (
              <ClaimRow
                key={claim.id}
                claim={claim}
                onClick={() => navigate(`/claims/${claim.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
