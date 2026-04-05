import { useAuth, useClerk, useOrganization, useOrganizationList, useUser } from "@clerk/clerk-react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Camera,
  LogOut,
  Mail,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useOrganizationApi } from "@/api/organization";
import { OrganizationInviteForm } from "@/components/organization/OrganizationInviteForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganizationMemberDirectory, type OrganizationMemberDirectoryEntry } from "@/hooks/useOrganizationMemberDirectory";

function initials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function roleLabel(role?: string | null) {
  return role === "org:admin" ? "Admin" : "Member";
}

function roleBadgeVariant(role?: string | null): "default" | "secondary" {
  return role === "org:admin" ? "default" : "secondary";
}

function displayMemberName(member: OrganizationMemberDirectoryEntry) {
  return member.fullName ?? member.email ?? member.userId;
}

function sortMembers(a: OrganizationMemberDirectoryEntry, b: OrganizationMemberDirectoryEntry) {
  if (a.role !== b.role) {
    return a.role === "org:admin" ? -1 : 1;
  }

  return displayMemberName(a).localeCompare(displayMemberName(b));
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
  const {
    userMemberships,
    createOrganization,
    setActive,
    isLoaded: orgListLoaded,
  } = useOrganizationList({
    userMemberships: { infinite: false },
  });
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [updatingMemberUserId, setUpdatingMemberUserId] = useState<string | null>(null);
  const { updateMembershipRole } = useOrganizationApi();

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
  const {
    memberDirectory,
    isLoading: membersLoading,
    refetch: refetchMembers,
  } = useOrganizationMemberDirectory(isAdminView && authIsAdmin);

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

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const verified = user.primaryEmailAddress?.verification.status === "verified";
  const allMembers = useMemo(
    () => Object.values(memberDirectory).sort(sortMembers),
    [memberDirectory],
  );
  const managedMembers = useMemo(
    () => allMembers.filter((member) => member.userId !== user.id),
    [allMembers, user.id],
  );
  const adminCount = allMembers.filter((member) => member.role === "org:admin").length;
  const memberCount = allMembers.filter((member) => member.role !== "org:admin").length;

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
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

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Unsupported format", {
        description: "Use JPG, PNG, WebP or GIF.",
      });
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
      event.target.value = "";
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleCreateOrg = async (event: FormEvent) => {
    event.preventDefault();
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

  const handleUpdateMemberRole = async (
    targetUserId: string,
    nextRole: "org:member" | "org:admin",
  ) => {
    setUpdatingMemberUserId(targetUserId);
    try {
      await updateMembershipRole({
        userId: targetUserId,
        role: nextRole,
      });
      await refetchMembers();
      toast.success(
        nextRole === "org:admin" ? "Member promoted to admin" : "Admin demoted to member",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update member role";
      toast.error(message);
    } finally {
      setUpdatingMemberUserId(null);
    }
  };

  const organizationCard = organization ? (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Organization
        </CardTitle>
        <CardDescription>
          This is the active organization tied to your current session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-6 pb-6">
        <div className="rounded-xl border bg-muted/40 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{organization.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your current access level determines what parts of the workspace you can use.
              </p>
            </div>
            <Badge variant={roleBadgeVariant(membership?.role)}>
              {roleLabel(membership?.role)}
            </Badge>
          </div>
        </div>

        {isAdminView && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/20 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Admins
              </p>
              <p className="mt-2 text-2xl font-semibold">{adminCount}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Members
              </p>
              <p className="mt-2 text-2xl font-semibold">{memberCount}</p>
            </div>
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
      <CardContent className="space-y-3 px-6 pb-6">
        {orgListLoaded && (userMemberships.data?.length ?? 0) > 0 ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                You're part of an organization, but it isn't active in this session yet. Activate it so claims and policy actions target the right workspace.
              </p>
            </div>

            <div className="space-y-2">
              {userMemberships.data?.map((currentMembership) => (
                <div
                  key={currentMembership.organization.id}
                  className="flex items-center justify-between rounded-lg border bg-muted/40 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {currentMembership.organization.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {roleLabel(currentMembership.role)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await setActive({ organization: currentMembership.organization.id });
                      toast.success(`Switched to ${currentMembership.organization.name}`);
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
                onChange={(event) => setNewOrgName(event.target.value)}
                required
                minLength={2}
                disabled={creatingOrg}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                disabled={creatingOrg || !newOrgName.trim()}
              >
                {creatingOrg ? "Creating..." : "Create"}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );

  const meContent = (
    <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="space-y-6">
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <div className="group relative">
              <Avatar className="h-20 w-20 text-lg">
                <AvatarImage src={user.imageUrl} alt={user.fullName ?? ""} />
                <AvatarFallback className="bg-primary text-xl font-semibold text-primary-foreground">
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
              <p className="animate-pulse text-xs text-muted-foreground">Uploading photo...</p>
            )}
          </CardContent>
        </Card>

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
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="Jane"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Smith"
                    required
                  />
                </div>
              </div>
              <Button type="submit" disabled={saving || !isDirty} className="w-full">
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3.5 py-2.5">
              <span className="text-sm">{email}</span>
              {verified && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              To change your email address, contact support.
            </p>
          </CardContent>
        </Card>

        {organizationCard}

        <Card className="shadow-sm">
          <CardContent className="px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-xs text-muted-foreground">
                  Sign out of this device
                </p>
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
      </div>
    </div>
  );

  const membersContent = !organization ? (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Users className="h-4 w-4 text-muted-foreground" />
          Members
        </CardTitle>
        <CardDescription>
          Activate or create an organization in the Me tab before managing members.
        </CardDescription>
      </CardHeader>
    </Card>
  ) : (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Users className="h-4 w-4 text-muted-foreground" />
              Team access
            </CardTitle>
            <CardDescription>
              Invite people with the right organization role and keep admin access scoped to trusted reviewers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-6 pb-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  Admins
                </p>
                <p className="mt-2 text-2xl font-semibold">{adminCount}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  Members
                </p>
                <p className="mt-2 text-2xl font-semibold">{memberCount}</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium">Invite someone new</p>
              <OrganizationInviteForm />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Member details</CardTitle>
          <CardDescription>
            Promote members to admins, demote admins back to members, and keep your own access managed from the Me tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-6">
          {membersLoading ? (
            <div className="rounded-xl border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              Loading organization members...
            </div>
          ) : managedMembers.length === 0 ? (
            <div className="rounded-xl border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              No other members have joined this organization yet.
            </div>
          ) : (
            managedMembers.map((member) => {
              const nextRole =
                member.role === "org:admin" ? "org:member" : "org:admin";
              const isUpdating = updatingMemberUserId === member.userId;

              return (
                <div
                  key={member.userId}
                  className="rounded-xl border bg-muted/20 px-4 py-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{displayMemberName(member)}</p>
                        <Badge variant={roleBadgeVariant(member.role)}>
                          {roleLabel(member.role)}
                        </Badge>
                      </div>
                      {member.email && (
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {member.role === "org:admin"
                          ? "Can manage policies, invites, member roles, and review workflows."
                          : "Can submit claims and view organization policies."}
                      </p>
                    </div>

                    <Button
                      variant={member.role === "org:admin" ? "outline" : "default"}
                      size="sm"
                      className="sm:min-w-36"
                      disabled={isUpdating}
                      onClick={() => handleUpdateMemberRole(member.userId, nextRole)}
                    >
                      {isUpdating
                        ? "Saving..."
                        : member.role === "org:admin"
                          ? "Demote to member"
                          : "Promote to admin"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate(backPath)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <ThemeToggle />
        </div>

        {isAdminView ? (
          <Tabs defaultValue="me" className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Admin profile</h1>
                <p className="text-sm text-muted-foreground">
                  Switch between your personal settings and organization member management from one page.
                </p>
              </div>
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="me">Me</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="me" className="space-y-6">
              {meContent}
            </TabsContent>

            <TabsContent value="members" className="space-y-6">
              {membersContent}
            </TabsContent>
          </Tabs>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
              <p className="text-sm text-muted-foreground">
                Update your personal details, verify your active organization, and manage your session.
              </p>
            </div>
            {meContent}
          </>
        )}

        <Separator />
        <p className="text-center text-xs text-muted-foreground">
          Expense Auditor · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
