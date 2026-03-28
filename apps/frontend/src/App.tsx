import { useAuth, useOrganizationList, useUser } from "@clerk/clerk-react";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { LoginPage } from "@/features/auth/LoginPage.tsx";
import { SignupPage } from "@/features/auth/SignupPage.tsx";
import { VerifyEmailPage } from "@/features/auth/VerifyEmailPage.tsx";
import { SSOCallbackPage } from "@/features/auth/SSOCallbackPage.tsx";
import { ProfilePage } from "@/features/auth/ProfilePage.tsx";
import { CreateOrgPage } from "@/features/auth/CreateOrgPage.tsx";
import { SubmitClaimPage } from "@/features/claims/SubmitClaimPage.tsx";
import { ClaimStatusPage } from "@/features/claims/ClaimStatusPage.tsx";
import { ClaimsListPage } from "@/features/claims/ClaimsListPage.tsx";
import PolicyAdminPage from "@/features/policy/PolicyAdminPage.tsx";
import PolicyPage from "@/features/policy/PolicyPage.tsx";

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Automatically activates the user's first org membership if no org is currently
 * active in the session. This ensures non-admin members who accepted an invite
 * always have ActiveOrganizationID set in their JWT, so the backend can resolve
 * the correct policy for their claims.
 */
function OrgActivator() {
  const { orgId } = useAuth();
  const { userMemberships, isLoaded, setActive } = useOrganizationList({
    userMemberships: { infinite: false },
  });

  useEffect(() => {
    if (!isLoaded || orgId) return;
    const first = userMemberships.data?.[0];
    if (first) {
      setActive({ organization: first.organization.id });
    }
  }, [isLoaded, orgId, userMemberships.data, setActive]);

  return null;
}

// Redirects to /login if not signed in
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return <Spinner />;
  if (!isSignedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Redirects to / if already signed in
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return <Spinner />;
  if (isSignedIn) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <OrgActivator />
      <Routes>
        {/* Public auth routes */}
        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="/signup" element={<AuthRoute><SignupPage /></AuthRoute>} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/sso-callback" element={<SSOCallbackPage />} />
        <Route path="/create-org" element={<ProtectedRoute><CreateOrgPage /></ProtectedRoute>} />

        {/* Protected routes */}
        <Route path="/" element={<ProtectedRoute><ClaimsListPage /></ProtectedRoute>} />
        <Route path="/claims/new" element={<ProtectedRoute><SubmitClaimPage /></ProtectedRoute>} />
        <Route path="/claims/:id" element={<ProtectedRoute><ClaimStatusPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

        <Route path="/admin/policy" element={<PolicyAdminPage />} />
        <Route path="/policy" element={<ProtectedRoute><PolicyPage /></ProtectedRoute>} />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
