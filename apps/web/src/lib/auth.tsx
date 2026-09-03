import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

interface Auth {
  session: Session | null;
  // Distinct from `!session` — true only while the very first getSession() call is still in
  // flight, so a route guard can tell "haven't checked yet" apart from "checked, not signed in"
  // and avoid a flash-redirect to /login before a real (persisted) session has had a chance to
  // load.
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<Auth | null>(null);

// Supabase's own error messages are either fine as-is or confusing enough to need translating —
// centralized here so sign-in/sign-up/reset all read the same way instead of drifting.
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Incorrect email or password.";
  if (lower.includes("email not confirmed")) return "Confirm your email first — check your inbox for the link we sent.";
  if (lower.includes("user already registered") || lower.includes("already registered"))
    return "An account with this email already exists — sign in instead.";
  if (lower.includes("password should be at least")) return "Password must be at least 6 characters.";
  if (lower.includes("email rate limit") || lower.includes("rate limit"))
    return "Too many attempts — wait a minute and try again.";
  if (lower.includes("failed to fetch") || lower.includes("network"))
    return "Couldn't reach the sign-in service — check your connection and try again.";
  return message;
}

// Every Supabase auth call goes through here so a dropped connection (not just a rejected
// request) still comes back as a normal { error } result instead of an uncaught rejection that
// leaves the submit button stuck spinning forever.
async function safeAuthCall(fn: () => Promise<{ error: { message: string } | null }>): Promise<{ error: string | null }> {
  try {
    const { error } = await fn();
    return { error: error ? friendlyAuthError(error.message) : null };
  } catch (err) {
    return { error: friendlyAuthError(err instanceof Error ? err.message : "Something went wrong. Try again.") };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value: Auth = {
    session,
    isLoading,
    signUp: (email, password) =>
      safeAuthCall(() => supabase.auth.signUp({ email: email.trim(), password })),
    signIn: (email, password) =>
      safeAuthCall(() => supabase.auth.signInWithPassword({ email: email.trim(), password })),
    signOut: async () => {
      await supabase.auth.signOut();
    },
    resendConfirmation: (email) =>
      safeAuthCall(() => supabase.auth.resend({ type: "signup", email: email.trim() })),
    requestPasswordReset: (email) =>
      safeAuthCall(() =>
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
      ),
    // Only valid once a PASSWORD_RECOVERY session is active (see ResetPasswordPage) — that's
    // what makes updateUser target "the account whose reset link was just clicked" rather than
    // needing the old password, which the whole point of "forgot password" is to not require.
    updatePassword: (password) => safeAuthCall(() => supabase.auth.updateUser({ password })),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
