import { useUser } from "@clerk/clerk-react";
import { RefreshCw } from "lucide-react";
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

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
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
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
