import { useAuth, useClerk, useOrganization, useUser } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
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
  FileText,
} from "lucide-react";
import { useState } from "react";
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
import type { ClaimResponse } from "@auditor/zod";
import { cn } from "@/lib/utils";

const statusIcon: Record<string, React.ElementType> = {
  pending: Clock,
  processing: RefreshCw,
  ocr_complete: Clock,
  needs_review: AlertTriangle,
  ocr_failed: XCircle,
  auditing: Clock,
  approved: CheckCircle2,
  flagged: AlertTriangle,
  rejected: XCircle,
};

const statusColor: Record<string, string> = {
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

function initials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

async function fetchClaims(token: string | null): Promise<ClaimResponse[]> {
  const resp = await axios.get<ClaimResponse[]>(`${API_URL}/api/v1/claims`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return resp.data;
}

export function ClaimsListPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken, orgRole } = useAuth();
  const { organization } = useOrganization();
  const { signOut } = useClerk();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ["claims"],
    queryFn: async () => {
      const token = await getToken();
      return fetchClaims(token);
    },
  });

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

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Receipt className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Expense Auditor
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => navigate("/claims/new")}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Claim
            </Button>

            <ThemeToggle />

            {/* Admin-only Invite Button */}
            {orgRole === "org:admin" && (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    Invite
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

            {/* User dropdown */}
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

                <DropdownMenuItem onClick={() => navigate(orgRole === "org:admin" ? "/admin/policy" : "/policy")}>
                  <FileText className="mr-2 h-4 w-4" />
                  {orgRole === "org:admin" ? "Policy Admin" : "Expense Policy"}
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
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="mb-6 text-lg font-semibold">My Claims</h2>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : claims.length === 0 ? (
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
          <div className="space-y-3">
            {claims.map((claim) => {
              const Icon = statusIcon[claim.status] ?? Clock;
              const color =
                statusColor[claim.status] ?? "text-muted-foreground";

              return (
                <Card
                  key={claim.id}
                  className="cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
                  onClick={() => navigate(`/claims/${claim.id}`)}
                >
                  <CardContent className="flex items-center gap-4 py-4">
                    <div
                      className={cn(
                        "shrink-0 rounded-full bg-muted p-2",
                        color
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {claim.merchantName ?? claim.businessPurpose}
                      </p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {claim.expenseCategory} ·{" "}
                        {new Date(
                          claim.claimedDate
                        ).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {claim.amount != null && (
                        <span className="text-sm font-semibold tabular-nums">
                          {claim.currency ?? ""}{" "}
                          {Number(claim.amount).toFixed(2)}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className="text-xs capitalize"
                      >
                        {claim.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
