"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { captureEvent } from "@/lib/analytics";

type Mode = "signin" | "signup";

function formatAuthError(err: { message: string; code?: string }): string {
  const { message, code } = err;
  if (
    code === "invalid_credentials" ||
    /invalid login credentials/i.test(message)
  ) {
    return [
      "Invalid email or password.",
      "If you just signed up, open the confirmation email first (Supabase blocks sign-in until the address is confirmed), or turn off “Confirm email” under Authentication → Providers → Email in your Supabase project for local testing.",
      "Use the Sign up tab if you have not created this user yet, and make sure this app’s .env.local URL and anon key match that same project.",
    ].join(" ");
  }
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError(true);
      setMessage("Enter your email and password.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(false);
    try {
      const supabase = createClient();
      if (mode === "signin") {
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signErr) {
          setEmail(trimmedEmail);
          setError(true);
          setMessage(formatAuthError(signErr));
          captureEvent("auth_sign_in_fail", {
            code: signErr.code ?? "unknown",
            message: signErr.message,
          });
          return;
        }
        captureEvent("auth_sign_in_success", { mode: "signin" });
        router.push("/");
        router.refresh();
        return;
      }

      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });
      if (signUpErr) {
        setError(true);
        setMessage(formatAuthError(signUpErr));
        captureEvent("auth_sign_up_fail", {
          code: signUpErr.code ?? "unknown",
          message: signUpErr.message,
        });
        return;
      }
      if (data.user && !data.session) {
        setError(false);
        setMessage(
          "Account created. Check your email to confirm your address, then sign in.",
        );
        captureEvent("auth_sign_up_pending_confirm", {
          user_id: data.user.id,
        });
        setMode("signin");
        setPassword("");
        return;
      }
      captureEvent("auth_sign_up_success", { mode: "signup" });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error ? err.message : "Something went wrong.",
      );
      captureEvent("auth_submit_exception", {
        mode,
        message: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="govbid-glow flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12">
      <div className="mb-8 flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/govbid-logo.svg"
          alt=""
          width={56}
          height={56}
          className="size-14 rounded-xl"
        />
        <div className="text-center">
          <p className="text-2xl font-bold tracking-tight text-govbid-text">GovBid</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-govbid-text-muted">
            RFP discovery, matched to you
          </p>
        </div>
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-govbid-border bg-govbid-elevated/90 p-8 shadow-[0_16px_48px_rgb(0_0_0/0.45)] backdrop-blur">
        <h1 className="text-center text-xl font-bold text-balance text-govbid-text">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-govbid-text-muted">
          {mode === "signin"
            ? "Sign in to see today's matched opportunities."
            : "Start discovering government contracts that fit your business."}
        </p>

        <div className="mt-6 flex rounded-lg border border-govbid-border bg-govbid-surface p-0.5 text-xs font-semibold">
          <button
            type="button"
            className={`flex-1 rounded-md py-2 transition ${
              mode === "signin"
                ? "bg-govbid-primary text-govbid-surface"
                : "text-govbid-text-muted hover:text-govbid-text"
            }`}
            onClick={() => {
              setMode("signin");
              setMessage(null);
              setError(false);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-2 transition ${
              mode === "signup"
                ? "bg-govbid-primary text-govbid-surface"
                : "text-govbid-text-muted hover:text-govbid-text"
            }`}
            onClick={() => {
              setMode("signup");
              setMessage(null);
              setError(false);
            }}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-xs font-medium text-govbid-text-muted">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="mt-1.5 w-full rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2.5 text-sm text-govbid-text outline-none transition focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary disabled:opacity-60"
              placeholder="you@agency.gov"
            />
          </label>
          <label className="block text-xs font-medium text-govbid-text-muted">
            Password
            <input
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className="mt-1.5 w-full rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2.5 text-sm text-govbid-text outline-none transition focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary disabled:opacity-60"
              placeholder="••••••••"
              minLength={6}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="govbid-btn-primary w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {busy
              ? mode === "signin"
                ? "Signing in…"
                : "Creating account…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        {message && (
          <div
            className={`mt-4 text-sm ${
              error ? "text-govbid-danger" : "text-govbid-text-muted"
            }`}
            role={error ? "alert" : "status"}
          >
            <p className="text-center leading-relaxed">{message}</p>
            {error && mode === "signin" && (
              <details className="mt-3 rounded-lg border border-govbid-border bg-govbid-surface/80 px-3 py-2 text-left text-xs text-govbid-text-muted">
                <summary className="cursor-pointer font-medium text-govbid-text">
                  Still stuck?
                </summary>
                <ul className="mt-2 list-inside list-disc space-y-1.5">
                  <li>
                    Create the user under Supabase → Authentication → Users
                    (set a password there), or use the Sign up tab.
                  </li>
                  <li>
                    Email is normalized to lowercase — use the same spelling you
                    used at sign-up.
                  </li>
                  <li>
                    Confirm <code className="rounded bg-govbid-primary-muted/60 px-1">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
                    and <code className="rounded bg-govbid-primary-muted/60 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
                    match the project where the user exists.
                  </li>
                </ul>
              </details>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-govbid-text-muted">
          <Link href="/" className="font-medium text-govbid-primary underline">
            Back to home
          </Link>{" "}
          (requires an account)
        </p>
      </div>
    </div>
  );
}
