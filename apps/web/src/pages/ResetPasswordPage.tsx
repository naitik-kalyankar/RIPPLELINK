import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Film } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

// Landed on from the email link requestPasswordReset() sends (see lib/auth.tsx's redirectTo).
// Supabase's client detects the recovery token in the URL fragment on load and fires a
// PASSWORD_RECOVERY auth event, exchanging it for a real (temporary) session — updatePassword()
// then just calls supabase.auth.updateUser({password}), which applies to whichever account that
// session belongs to. No old password needed; that's the entire point of "forgot password".
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The recovery session may already be live by the time this mounts, or may arrive a moment
    // later via the auth event — either way, once *some* session exists the link was valid.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/", { replace: true }), 1500);
  };

  return (
    <div className="flex h-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Film className="h-4 w-4" />
          </div>
          <CardTitle className="text-base">Set a new password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="rounded-md border border-border bg-accent/40 p-3 text-sm text-muted-foreground">
              Password updated — taking you in…
            </p>
          ) : !ready ? (
            <p className="rounded-md border border-border bg-accent/40 p-3 text-sm text-muted-foreground">
              This reset link is invalid or has expired.{" "}
              <button type="button" className="text-primary hover:underline" onClick={() => navigate("/login")}>
                Request a new one
              </button>
              .
            </p>
          ) : (
            <form className="grid gap-3" onSubmit={handleSubmit}>
              <div className="grid gap-1.5">
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="reset-password-confirm">Confirm password</Label>
                <Input
                  id="reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting} className="mt-1">
                {submitting ? "…" : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
