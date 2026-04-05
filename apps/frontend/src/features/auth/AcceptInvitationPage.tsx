import { useSignIn, useSignUp } from "@clerk/clerk-react";
import { Eye, EyeOff, Receipt, RefreshCw, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ClerkCaptcha } from "./ClerkCaptcha";
import { getClerkError } from "./utils";

type SignInResource = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;
type SignInAttemptResult = Awaited<ReturnType<SignInResource["create"]>>;

const invitationSignInAttempts = new Map<string, Promise<SignInAttemptResult>>();

function runInvitationSignIn(
  ticket: string,
  signIn: SignInResource,
): Promise<SignInAttemptResult> {
  const existingAttempt = invitationSignInAttempts.get(ticket);
  if (existingAttempt) {
    return existingAttempt;
  }

  const attempt = signIn
    .create({
      strategy: "ticket",
      ticket,
    })
    .finally(() => {
      invitationSignInAttempts.delete(ticket);
    });

  invitationSignInAttempts.set(ticket, attempt);
  return attempt;
}

export function AcceptInvitationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const ticket = searchParams.get("__clerk_ticket");
  const accountStatus = searchParams.get("__clerk_status");

  const isReady = signInLoaded && signUpLoaded;
  const normalizedStatus = useMemo(() => {
    switch (accountStatus) {
      case "sign_in":
      case "sign_up":
      case "complete":
        return accountStatus;
      default:
        return null;
    }
  }, [accountStatus]);

  useEffect(() => {
    if (!ticket) {
      setFatalError("This invitation link is missing the required Clerk ticket.");
      return;
    }

    if (!normalizedStatus) {
      setFatalError("This invitation link is invalid or has already been processed.");
      return;
    }

    if (normalizedStatus === "complete") {
      navigate("/", { replace: true });
      return;
    }

    if (normalizedStatus !== "sign_in" || !isReady || !signIn || !setActiveSignIn) {
      return;
    }

    let cancelled = false;

    const acceptInvitation = async () => {
      setSigningIn(true);
      try {
        const result = await runInvitationSignIn(ticket, signIn);

        if (cancelled) return;

        if (result.status === "complete") {
          await setActiveSignIn({ session: result.createdSessionId });
          toast.success("Invitation accepted");
          navigate("/", { replace: true });
          return;
        }

        setFatalError("This invitation requires additional steps that are not supported by this flow yet.");
      } catch (err) {
        if (cancelled) return;
        setFatalError(getClerkError(err));
      } finally {
        if (!cancelled) setSigningIn(false);
      }
    };

    void acceptInvitation();

    return () => {
      cancelled = true;
    };
  }, [ticket, normalizedStatus, isReady, signIn, setActiveSignIn, navigate]);

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticket || normalizedStatus !== "sign_up" || !signUpLoaded || !signUp || !setActiveSignUp) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await signUp.create({
        strategy: "ticket",
        ticket,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });

      if (result.status === "complete") {
        await setActiveSignUp({ session: result.createdSessionId });
        toast.success("Invitation accepted");
        navigate("/", { replace: true });
        return;
      }

      setFatalError("This invitation could not be completed automatically.");
    } catch (err) {
      toast.error("Could not accept invitation", { description: getClerkError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (fatalError) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <Card className="w-full max-w-md shadow-sm">
          <CardHeader className="text-center">
            <CardTitle>Invitation unavailable</CardTitle>
            <CardDescription>{fatalError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>
              Go to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!ticket || !normalizedStatus || !isReady || normalizedStatus === "sign_in") {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary shadow-sm">
              {signingIn
                ? <RefreshCw className="h-5 w-5 animate-spin text-primary-foreground" />
                : <Receipt className="h-5 w-5 text-primary-foreground" />}
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight">Joining workspace</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {signingIn ? "Accepting your invitation…" : "Preparing your invitation…"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary shadow-sm">
            <UserPlus className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">Accept invitation</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Finish creating your account to join the organization.
            </p>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Complete your account</CardTitle>
            <CardDescription>Your email will be verified automatically from the invitation.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    required
                    disabled={submitting}
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
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={submitting}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Joining…" : "Join workspace"}
              </Button>

              <ClerkCaptcha />
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
