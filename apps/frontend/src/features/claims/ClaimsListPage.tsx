import { useClaimsApi } from "@/api/claims";
import { useOrganizationApi } from "@/api/organization";
import { usePolicyApi } from "@/api/policy";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { AdminFiltersPanel } from "@/features/claims/components/list/AdminFiltersPanel";
import { ClaimsResultsSection } from "@/features/claims/components/list/ClaimsResultsSection";
import {
  type ClaimsPageRouteMode,
  initials,
} from "@/features/claims/components/list/claim-list-utils";
import { useAdminClaimFilters } from "@/features/claims/hooks/useAdminClaimFilters";
import { useActiveOrganizationReady } from "@/hooks/useActiveOrganizationReady";
import { useOrganizationMemberDirectory } from "@/hooks/useOrganizationMemberDirectory";
import { cn } from "@/lib/utils";
import { useAuth, useClerk, useOrganization, useUser } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  LogOut,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function ClaimsListPage({
  routeMode,
}: {
  routeMode?: ClaimsPageRouteMode;
}) {
  const navigate = useNavigate();
  const { user } = useUser();
  const { orgRole, isLoaded: authLoaded, isSignedIn } = useAuth();
  const { organization } = useOrganization();
  const { signOut } = useClerk();
  const { listClaims, listAdminClaims } = useClaimsApi();
  const { getActivePolicy } = usePolicyApi();
  const { createInvitation } = useOrganizationApi();
  const {
    orgId: activeOrgId,
    isReady: isActiveOrgReady,
    isWaitingForActivation: isWaitingForActiveOrg,
  } = useActiveOrganizationReady();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const authIsAdmin = orgRole === "org:admin";
  const isAdminView =
    routeMode === "admin"
      ? true
      : routeMode === "member"
        ? false
        : authIsAdmin;
  const memberRouteRedirect = authLoaded && routeMode === "member" && authIsAdmin;
  const adminRouteRedirect = authLoaded && routeMode === "admin" && !authIsAdmin;
  const { memberDirectory } = useOrganizationMemberDirectory(isAdminView);

  const queryEnabled = authLoaded && isSignedIn === true;
  const claimsQueryEnabled =
    queryEnabled &&
    !isWaitingForActiveOrg &&
    !memberRouteRedirect &&
    !adminRouteRedirect;

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

      return listClaims();
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
  const adminFilters = useAdminClaimFilters({
    claims: rawClaims,
    memberDirectory,
    currentUserId: user?.id,
  });
  const claimList = isAdminView ? adminFilters.filteredClaims : rawClaims;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
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

  const policyPath = orgRole === "org:admin" ? "/admin/policy" : "/policy";
  const policyLabel = orgRole === "org:admin" ? "Policy Admin" : "Policy";
  const profilePath = isAdminView ? "/admin/profile" : "/profile";
  const claimsHeading = isAdminView ? "Claims To Review" : "My Claims";
  const claimsEmptyTitle = isAdminView
    ? adminFilters.activeFilterCount > 0
      ? "No claims match those filters"
      : "No member claims yet"
    : "No claims yet";
  const claimsEmptyBody = isAdminView
    ? adminFilters.activeFilterCount > 0
      ? "Try broadening your search, date range, or status filters."
      : "When team members submit expenses, they will appear here for review."
    : "Submit your first expense claim to get started.";
  const isInitialLoading =
    !authLoaded ||
    isWaitingForActiveOrg ||
    (isLoading && rawClaims.length === 0);
  const pageShellWidthClassName = isAdminView ? "max-w-7xl" : "max-w-3xl";

  if (memberRouteRedirect) {
    return <Navigate to="/admin/claims" replace />;
  }

  if (adminRouteRedirect) {
    return <Navigate to="/claims" replace />;
  }

  const claimsContent = (
    <ClaimsResultsSection
      heading={claimsHeading}
      claims={claimList}
      rawClaimCount={rawClaims.length}
      isAdminView={isAdminView}
      isInitialLoading={isInitialLoading}
      isFetching={isFetching}
      activeFilterCount={adminFilters.activeFilterCount}
      dateField={isAdminView ? adminFilters.dateField : "claimed"}
      emptyTitle={claimsEmptyTitle}
      emptyBody={claimsEmptyBody}
      memberDirectory={memberDirectory}
      onSelectClaim={(claimId) =>
        navigate(isAdminView ? `/admin/claims/${claimId}` : `/claims/${claimId}`)
      }
      onCreateClaim={!isAdminView ? () => navigate("/claims/new") : undefined}
    />
  );

  return (
    <div className="min-h-screen bg-background">
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
                        onChange={(event) => setInviteEmail(event.target.value)}
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
                    <AvatarImage src={user?.imageUrl} alt={user?.fullName ?? ""} />
                    <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
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
                <DropdownMenuItem onClick={() => navigate(profilePath)}>
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

      <main className={cn("mx-auto px-4 py-8", pageShellWidthClassName)}>
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
                adminSearchText={adminFilters.adminSearchText}
                setAdminSearchText={adminFilters.setAdminSearchText}
                statusFilterLabel={adminFilters.statusFilterLabel}
                selectedStatuses={adminFilters.selectedStatuses}
                toggleStatusFilter={adminFilters.toggleStatusFilter}
                selectedUploaderUserId={adminFilters.selectedUploaderUserId}
                setSelectedUploaderUserId={adminFilters.setSelectedUploaderUserId}
                uploaderOptions={adminFilters.uploaderOptions}
                flaggedFilter={adminFilters.flaggedFilter}
                setFlaggedFilter={adminFilters.setFlaggedFilter}
                activeFilterCount={adminFilters.activeFilterCount}
                clearAdminFilters={adminFilters.clearAdminFilters}
                dateField={adminFilters.dateField}
                setDateField={adminFilters.setDateField}
                dateFrom={adminFilters.dateFrom}
                setDateFrom={adminFilters.setDateFrom}
                dateTo={adminFilters.dateTo}
                setDateTo={adminFilters.setDateTo}
                sortBy={adminFilters.sortBy}
                setSortBy={adminFilters.setSortBy}
                sortDir={adminFilters.sortDir}
                setSortDir={adminFilters.setSortDir}
              />
            </div>

            <div className="hidden items-start gap-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]">
              <AdminFiltersPanel
                adminSearchText={adminFilters.adminSearchText}
                setAdminSearchText={adminFilters.setAdminSearchText}
                statusFilterLabel={adminFilters.statusFilterLabel}
                selectedStatuses={adminFilters.selectedStatuses}
                toggleStatusFilter={adminFilters.toggleStatusFilter}
                selectedUploaderUserId={adminFilters.selectedUploaderUserId}
                setSelectedUploaderUserId={adminFilters.setSelectedUploaderUserId}
                uploaderOptions={adminFilters.uploaderOptions}
                flaggedFilter={adminFilters.flaggedFilter}
                setFlaggedFilter={adminFilters.setFlaggedFilter}
                activeFilterCount={adminFilters.activeFilterCount}
                clearAdminFilters={adminFilters.clearAdminFilters}
                dateField={adminFilters.dateField}
                setDateField={adminFilters.setDateField}
                dateFrom={adminFilters.dateFrom}
                setDateFrom={adminFilters.setDateFrom}
                dateTo={adminFilters.dateTo}
                setDateTo={adminFilters.setDateTo}
                sortBy={adminFilters.sortBy}
                setSortBy={adminFilters.setSortBy}
                sortDir={adminFilters.sortDir}
                setSortDir={adminFilters.setSortDir}
                className="sticky top-24 max-h-[calc(100vh-7.5rem)]"
              />

              <section className="rounded-2xl border border-border/40 bg-card/[0.03] px-5 py-5">
                {claimsContent}
              </section>
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
