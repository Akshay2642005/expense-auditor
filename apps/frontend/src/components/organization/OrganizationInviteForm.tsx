import { useState } from "react";
import { toast } from "sonner";
import { useOrganizationApi } from "@/api/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrganizationInviteFormProps = {
  onInvited?: () => void;
  submitLabel?: string;
  description?: string;
  buttonClassName?: string;
};

const ROLE_LABELS = {
  "org:member": "Member",
  "org:admin": "Admin",
} as const;

export function OrganizationInviteForm({
  onInvited,
  submitLabel = "Send invite",
  description = "Choose whether the invitee should join as a claim submitter or as an organization admin.",
  buttonClassName,
}: OrganizationInviteFormProps) {
  const { createInvitation } = useOrganizationApi();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"org:member" | "org:admin">(
    "org:member",
  );
  const [inviting, setInviting] = useState(false);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    try {
      const emailAddress = inviteEmail.trim();
      await createInvitation({
        emailAddress,
        role: inviteRole,
      });
      toast.success(`Invite sent to ${emailAddress}`, {
        description: `${ROLE_LABELS[inviteRole]} access selected.`,
      });
      setInviteEmail("");
      setInviteRole("org:member");
      onInvited?.();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send invite. Check the email address.";
      toast.error(message);
    } finally {
      setInviting(false);
    }
  };

  return (
    <form onSubmit={handleInvite} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="org-invite-email">Email address</Label>
        <Input
          id="org-invite-email"
          type="email"
          placeholder="colleague@company.com"
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          required
          disabled={inviting}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-invite-role">Organization role</Label>
        <Select
          value={inviteRole}
          onValueChange={(value) =>
            setInviteRole(value as "org:member" | "org:admin")
          }
          disabled={inviting}
        >
          <SelectTrigger
            id="org-invite-role"
            className="h-10 w-full bg-background"
          >
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="org:member">Member</SelectItem>
            <SelectItem value="org:admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">{description}</p>

      <Button
        type="submit"
        className={buttonClassName ?? "w-full"}
        disabled={inviting || !inviteEmail.trim()}
      >
        {inviting ? "Sending..." : submitLabel}
      </Button>
    </form>
  );
}
