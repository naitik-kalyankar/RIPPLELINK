import { useState } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { Film } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

type Mode = "sign-in" | "sign-up" | "forgot-password";

// One page for /login, /sign-up, and the "forgot password" step — same form shape and error
// handling throughout, so the three don't drift into three subtly different UIs. The route
// decides which mode opens by default; links at the bottom switch modes without a navigation.
export function AuthPage() {
  const location = useLocation();
  const { session, isLoading, signIn, signUp, resendConfirmation, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>(location.pathname === "/sign-up" ? "sign-up" : "sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedUp, setSignedUp] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Only offered once a sign-in fails with the specific "not confirmed" error — offering it
  // unconditionally would leak whether an email is registered at all.
  const [showResend, setShowResend] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // Don't flash the form for someone who's already signed in and just landed on /login by a
  // stale link/bookmark.
  if (!isLoading && session) return <Navigate to="/" replace />;

  const resetTransientState = () => {
    setError(null);
    setSignedUp(false);
    setResetSent(false);
    setShowResend(false);
    setResendSent(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetTransientState();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetTransientState();
    setSubmitting(true);

    if (mode === "forgot-password") {
      const result = await requestPasswordReset(email);
      setSubmitting(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setResetSent(true);
      return;
    }

    const result = mode === "sign-in" ? await signIn(email, password) : await signUp(email, password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      if (mode === "sign-in" && result.error.toLowerCase().includes("confirm your email")) setShowResend(true);
      return;
    }
    if (mode === "sign-up") setSignedUp(true);
  };

  const handleResend = async () => {
    setSubmitting(true);
    const result = await resendConfirmation(email);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setResendSent(true);
  };

  const titles: Record<Mode, { title: string; description: string }> = {
    "sign-in": { title: "Sign in", description: "Welcome back to RIPPLELINK." },
    "sign-up": { title: "Create your account", description: "Get started with RIPPLELINK." },
    "forgot-password": { title: "Reset your password", description: "We'll email you a link to set a new one." },
  };

  return (
    <div className="flex h-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Film className="h-4 w-4" />
          </div>
          <CardTitle className="text-base">{titles[mode].title}</CardTitle>
          <CardDescription>{titles[mode].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {signedUp ? (
            <p className="rounded-md border border-border bg-accent/40 p-3 text-sm text-muted-foreground">
              Check your inbox to confirm your email, then sign in.
            </p>
          ) : resetSent ? (
            <p className="rounded-md border border-border bg-accent/40 p-3 text-sm text-muted-foreground">
              If an account exists for {email.trim()}, a reset link is on its way — check your inbox.
            </p>
          ) : (
            <form className="grid gap-3" onSubmit={handleSubmit}>
              <div className="grid gap-1.5">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {mode !== "forgot-password" && (
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auth-password">Password</Label>
                    {mode === "sign-in" && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => switchMode("forgot-password")}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {showResend && !resendSent && (
                <button
                  type="button"
                  className="text-left text-xs text-primary hover:underline"
                  onClick={handleResend}
                  disabled={submitting}
                >
                  Resend confirmation email
                </button>
              )}
              {resendSent && <p className="text-xs text-success">Confirmation email sent — check your inbox.</p>}
              <Button type="submit" disabled={submitting} className="mt-1">
                {submitting
                  ? "…"
                  : mode === "sign-in"
                    ? "Sign in"
                    : mode === "sign-up"
                      ? "Sign up"
                      : "Send reset link"}
              </Button>
            </form>
          )}

          {mode === "forgot-password" ? (
            <button
              type="button"
              className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => switchMode("sign-in")}
            >
              Back to sign in
            </button>
          ) : (
            <button
              type="button"
              className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            >
              {mode === "sign-in" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
