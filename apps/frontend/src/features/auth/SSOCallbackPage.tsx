import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { RefreshCw } from "lucide-react";

// Clerk handles the OAuth token exchange here and then redirects to redirectUrlComplete ("/").
// This page intentionally renders no UI of its own.
export function SSOCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <p className="text-sm">Completing sign in…</p>
      </div>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
