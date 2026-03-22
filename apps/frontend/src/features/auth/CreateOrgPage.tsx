import { useOrganizationList } from "@clerk/clerk-react";
import { Building2, Receipt } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

export function CreateOrgPage() {
  const { createOrganization, setActive, isLoaded } = useOrganizationList();
  const navigate = useNavigate();

  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !createOrganization) return;
    setLoading(true);
    try {
      const org = await createOrganization({ name: orgName.trim() });
      await setActive({ organization: org.id });
      navigate("/", { replace: true });
    } catch {
      toast.error("Failed to create organization. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigate("/", { replace: true });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary shadow-sm">
            <Receipt className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">Set up your workspace</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Create an organization to manage your team's expense policies
            </p>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardContent className="space-y-4 px-6 pt-6 pb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mx-auto">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="orgName">Organization name</Label>
                <Input
                  id="orgName"
                  placeholder="Acme Corp"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  minLength={2}
                  disabled={loading}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  This will be your team's workspace for expense policies and claims.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !orgName.trim()}
              >
                {loading ? "Creating…" : "Create organization"}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center border-t px-6 py-4">
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Skip for now
            </button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
