import { useSignUp } from "@clerk/clerk-react";
import { Mail, Receipt, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getClerkError } from "./utils";

export function VerifyEmailPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // If no pending sign-up, redirect to signup
  useEffect(() => {
    if (isLoaded && !signUp?.emailAddress) {
      navigate("/signup", { replace: true });
    }
  }, [isLoaded, signUp, navigate]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        toast.success("Email verified — welcome aboard!");
        navigate("/create-org");
      } else {
        toast.error("Verification incomplete", {
          description: "Please check the code and try again.",
        });
      }
    } catch (err) {
      toast.error("Invalid code", { description: getClerkError(err) });
      setCode("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signUp) return;
    setResending(true);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      toast.success("Code resent — check your inbox.");
    } catch (err) {
      toast.error("Resend failed", { description: getClerkError(err) });
    } finally {
      setResending(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Brand mark */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary shadow-sm">
            <Receipt className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="items-center pb-4 pt-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg">Check your email</CardTitle>
            <CardDescription className="text-center">
              We sent a 6-digit code to{" "}
              <span className="font-medium text-foreground">
                {signUp?.emailAddress}
              </span>
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-6">
            <form onSubmit={handleVerify} className="space-y-4">
              <Input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                disabled={loading}
                className="text-center text-xl tracking-[0.5em] font-mono"
              />

              <Button
                type="submit"
                className="w-full"
                disabled={loading || code.length < 6}
              >
                {loading ? "Verifying…" : "Verify email"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Didn't receive it?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {resending ? "Sending…" : "Resend code"}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
