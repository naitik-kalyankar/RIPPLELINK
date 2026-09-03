import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClippingScopeProvider } from "@/lib/clippingScope";
import { LinkQueueProvider } from "@/lib/linkQueue";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useMe } from "@/api/integrations";
import { useClippingAccounts } from "@/api/clippingAccounts";
import { AppShell } from "@/components/layout/AppShell";
import { DesktopWindowFrame } from "@/components/layout/DesktopWindowFrame";
import { ClippingAccountGate } from "@/components/onboarding/ClippingAccountGate";
import { AuthPage } from "@/pages/AuthPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ReelsPage } from "@/pages/ReelsPage";
import { InstagramAccountsPage } from "@/pages/InstagramAccountsPage";
import { PayoutPage } from "@/pages/PayoutPage";
import { UploadQueuePage } from "@/pages/UploadQueuePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AdminPayoutsPage } from "@/pages/AdminPayoutsPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();
  // Blank rather than a spinner — this only shows for the brief moment before a persisted
  // session (or its absence) is confirmed, on every cold load.
  if (isLoading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// A brand-new user has a session but no CLIPPING account connected yet — every page in AppShell
// (Reels, Instagram accounts, Payouts) is either empty or meaningless without one, so this gates
// the whole shell behind a single minimal "connect CLIPPING" screen instead of AppShell itself.
//
// Distinguishing isError from "the list came back empty" matters a lot here: react-query never
// populates `data` on a failed request, so treating `!data` alone as "zero accounts" showed the
// exact same "connect your CLIPPING account" screen for someone who actually has several — the
// request just never reached apps/api (wrong URL, or — the real desktop-build case — nobody
// started it; Tauri only runs the webview shell, not the backend). That reads as the app losing
// track of a real account, not as a connectivity problem, so it gets its own message instead.
function RequireClippingAccount({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, error } = useClippingAccounts();
  if (isLoading) return null;
  if (isError) return <BackendUnreachable message={error instanceof Error ? error.message : undefined} />;
  if (!data || data.items.length === 0) return <ClippingAccountGate />;
  return <>{children}</>;
}

function BackendUnreachable({ message }: { message?: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="max-w-sm rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-destructive">Can't reach the RIPPLELINK backend</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {message ?? "The API isn't responding."} Make sure <code className="text-xs">apps/api</code> is running — the
          desktop app doesn't start it for you, it's a separate process.
        </p>
      </div>
    </div>
  );
}

// Purely a UX nicety — bounces a non-admin straight back to the dashboard instead of letting
// the page render and then fail its API calls. NOT the real security boundary: every
// /api/admin/* route independently re-checks isAdmin server-side (see lib/auth.ts) against the
// verified JWT's subject, so nothing about this component (or editing it away in devtools) can
// actually grant access to another user's data.
function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  if (!me?.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Shown instead of the whole app when VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY aren't set —
// used to be a hard crash (blank white page, nothing but a console error) since supabaseClient
// threw at import time. A real on-page message is much easier to act on.
function SupabaseNotConfigured() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-sm font-semibold">Supabase isn't configured</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Set <code className="text-xs">VITE_SUPABASE_URL</code> and{" "}
          <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> in <code className="text-xs">apps/web/.env</code>,
          then restart the dev server.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DesktopWindowFrame>
      <AppRoutes />
    </DesktopWindowFrame>
  );
}

function AppRoutes() {
  if (!isSupabaseConfigured) return <SupabaseNotConfigured />;

  return (
    <TooltipProvider delayDuration={200}>
      <AuthProvider>
        <ClippingScopeProvider>
          <LinkQueueProvider>
            <Routes>
              <Route path="/login" element={<AuthPage />} />
              <Route path="/sign-up" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route
                element={
                  <RequireAuth>
                    <RequireClippingAccount>
                      <AppShell />
                    </RequireClippingAccount>
                  </RequireAuth>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="/reels" element={<ReelsPage />} />
                <Route path="/instagram-accounts" element={<InstagramAccountsPage />} />
                <Route path="/payout" element={<PayoutPage />} />
                <Route path="/upload-queue" element={<UploadQueuePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route
                  path="/admin/payouts"
                  element={
                    <RequireAdmin>
                      <AdminPayoutsPage />
                    </RequireAdmin>
                  }
                />
              </Route>
            </Routes>
          </LinkQueueProvider>
        </ClippingScopeProvider>
      </AuthProvider>
    </TooltipProvider>
  );
}
