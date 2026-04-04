import { useAuth, useClerk, useOrganization, useOrganizationList, useUser } from "@clerk/clerk-react";
import { AlertTriangle, ArrowLeft, Building2, Camera, LogOut, Mail, Plus, ShieldCheck, User, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useOrganizationApi } from "@/api/organization";

function initials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export function ProfilePage({
  routeMode,
}: {
  routeMode?: "member" | "admin";
}) {
  const { user, isLoaded } = useUser();
  const { orgRole, isLoaded: authLoaded } = useAuth();
  const { signOut } = useClerk();
  const { organization, membership } = useOrganization();
  const { userMemberships, createOrganization, setActive, isLoaded: orgListLoaded } = useOrganizationList({
    userMemberships: { infinite: false },
  });
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const { createInvitation } = useOrganizationApi();

  const authIsAdmin = orgRole === "org:admin";
  const isAdmin = membership?.role === "org:admin";
  const isAdminView =
    routeMode === "admin"
      ? true
      : routeMode === "member"
        ? false
        : authIsAdmin;
  const memberRouteRedirect = authLoaded && routeMode === "member" && authIsAdmin;
  const adminRouteRedirect = authLoaded && routeMode === "admin" && !authIsAdmin;
  const backPath = isAdminView ? "/admin/claims" : "/claims";

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
    }
  }, [user]);

  if (memberRouteRedirect) {
    return <Navigate to="/admin/profile" replace />;
  }

  if (adminRouteRedirect) {
    return <Navigate to="/profile" replace />;
  }

  if (!isLoaded || !authLoaded || !user) return null;

  const isDirty =
    firstName.trim() !== (user.firstName ?? "") ||
    lastName.trim() !== (user.lastName ?? "");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Unsupported format", { description: "Use JPG, PNG, WebP or GIF." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large", { description: "Maximum 5 MB." });
      return;
    }
    setUploading(true);
    try {
      await user.setProfileImage({ file });
      toast.success("Profile photo updated");
    } catch {
      toast.error("Failed to update photo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await createInvitation({ emailAddress: inviteEmail.trim(), role: "org:member" });
      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch {
      toast.error("Failed to send invite. Check the email address.");
    } finally {
      setInviting(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgListLoaded || !createOrganization || !newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const org = await createOrganization({ name: newOrgName.trim() });
      await setActive({ organization: org.id });
      toast.success(`Organization "${org.name}" created`);
      setNewOrgName("");
    } catch {
      toast.error("Failed to create organization.");
    } finally {
      setCreatingOrg(false);
    }
  };

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const verified = user.primaryEmailAddress?.verification.status === "verified";

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-lg space-y-6">

        {/* Top nav */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate(backPath)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <ThemeToggle />
        </div>

        {/* Avatar card */}
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <div className="group relative">
              <Avatar className="h-20 w-20 text-lg">
                <AvatarImage src={user.imageUrl} alt={user.fullName ?? ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                  {initials(user.firstName, user.lastName)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/40 disabled:cursor-not-allowed"
                aria-label="Change profile photo"
              >
                <Camera className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold">{user.fullName}</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
            {uploading && (
              <p className="animate-pulse text-xs text-muted-foreground">Uploading photo…</p>
            )}
          </CardContent>
        </Card>

        {/* Name */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <User className="h-4 w-4 text-muted-foreground" />
              Personal information
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                    required
                  />
                </div>
              </div>
              <Button type="submit" disabled={saving || !isDirty} className="w-full">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Email */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email address
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3.5 py-2.5">
              <span className="text-sm">{email}</span>
              {verified && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              To change your email address, contact support.
            </p>
          </CardContent>
        </Card>

        {/* Organization */}
        {organization ? (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Organization
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3.5 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{organization.name}</span>
                </div>
                {isAdmin && (
                  <span className="text-xs text-primary font-medium shrink-0 ml-2">Admin</span>
                )}
              </div>

              {/* Invite member — admin only */}
              {isAdmin && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Invite team member
                  </p>
                  <form onSubmit={handleInvite} className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      disabled={inviting}
                      className="flex-1"
                    />
                    <Button type="submit" size="sm" disabled={inviting || !inviteEmail.trim()}>
                      {inviting ? "Sending…" : (
                        <><Plus className="h-3.5 w-3.5 mr-1" />Invite</>
                      )}
                    </Button>
                  </form>
                  <p className="text-xs text-muted-foreground">
                    Invited members join as employees and can submit expense claims.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Organization
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-3">
              {/* Member of orgs but none active in session */}
              {orgListLoaded && (userMemberships.data?.length ?? 0) > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3.5 py-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      You're a member of an organization but it's not active in your current session. Activate it so your expense claims are processed correctly.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {userMemberships.data?.map((m) => (
                      <div key={m.organization.id} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3.5 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">{m.organization.name}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 ml-2"
                          onClick={async () => {
                            await setActive({ organization: m.organization.id });
                            toast.success(`Switched to ${m.organization.name}`);
                          }}
                        >
                          Activate
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    You're not part of an organization yet. Create one to manage expense policies for your team.
                  </p>
                  <form onSubmit={handleCreateOrg} className="flex gap-2">
                    <Input
                      placeholder="Acme Corp"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      required
                      minLength={2}
                      disabled={creatingOrg}
                      className="flex-1"
                    />
                    <Button type="submit" size="sm" disabled={creatingOrg || !newOrgName.trim()}>
                      {creatingOrg ? "Creating…" : "Create"}
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Sign out */}
        <Card className="shadow-sm">          <CardContent className="px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-xs text-muted-foreground">Sign out of this device</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You'll need to sign in again to access your expense claims.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleSignOut}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sign out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        <Separator />
        <p className="text-center text-xs text-muted-foreground">
          Expense Auditor · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
