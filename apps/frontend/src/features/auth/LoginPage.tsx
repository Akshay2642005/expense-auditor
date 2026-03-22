import { useSignIn } from "@clerk/clerk-react";
import { Eye, EyeOff, Receipt } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getClerkError, GitHubIcon, GoogleIcon } from "./utils";
import { getLastUsedProvider, setLastUsedProvider } from "./lastUsedProvider";

export function LoginPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);

  const lastUsed = getLastUsedProvider();
  const busy = loading || oauthLoading !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        setLastUsedProvider("email");
        await setActive({ session: result.createdSessionId });
        navigate("/");
      }
    } catch (err) {
      toast.error("Sign in failed", { description: getClerkError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "oauth_google" | "oauth_github") => {
    if (!isLoaded) return;
    const key = provider === "oauth_google" ? "google" : "github";
    setOauthLoading(key);
    try {
      setLastUsedProvider(key);
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: `${window.location.origin}/sso-callback`,
        redirectUrlComplete: "/",
      });
    } catch (err) {
      toast.error("Sign in failed", { description: getClerkError(err) });
      setOauthLoading(null);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      {/* wider card: max-w-md instead of max-w-sm */}
      <div className="w-full max-w-md space-y-6">

        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary shadow-sm">
            <Receipt className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">Expense Auditor</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Sign in to your account</p>
          </div>
        </div>

        {/* Card — no CardHeader so there's no dead space above Google */}
        <Card className="shadow-sm">
          <CardContent className="space-y-3 px-6 pt-6 pb-2">

            {/* Google */}
            <OAuthButton
              icon={<GoogleIcon />}
              label="Continue with Google"
              loading={oauthLoading === "google"}
              disabled={busy}
              isLastUsed={lastUsed === "google"}
              onClick={() => handleOAuth("oauth_google")}
            />

            {/* GitHub */}
            <OAuthButton
              icon={<GitHubIcon />}
              label="Continue with GitHub"
              loading={oauthLoading === "github"}
              disabled={busy}
              isLastUsed={lastUsed === "github"}
              onClick={() => handleOAuth("oauth_github")}
            />

            {/* Divider */}
            <div className="relative flex items-center py-1">
              <Separator className="flex-1" />
              <span className="mx-3 text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            {/* Email / password */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={busy}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {loading ? "Signing in…" : (
                  <span className="flex items-center gap-2">
                    Sign in with email
                    {lastUsed === "email" && <LastUsedBadge />}
                  </span>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center border-t px-6 py-4">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

/* ─── shared sub-components ───────────────────────────────────────────────── */

function LastUsedBadge() {
  return (
    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary leading-none">
      Last used
    </span>
  );
}

interface OAuthButtonProps {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  isLastUsed: boolean;
  onClick: () => void;
}

function OAuthButton({ icon, label, loading, disabled, isLastUsed, onClick }: OAuthButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      // gap-3 centres the icon+label group; no justify-start → defaults to justify-center
      className="w-full gap-3"
      onClick={onClick}
      disabled={disabled}
    >
      {/* fixed-width icon slot so the label stays visually centred */}
      <span className="flex w-5 items-center justify-center shrink-0">
        {loading
          ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          : icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
      {isLastUsed && !loading && <LastUsedBadge />}
    </Button>
  );
}
