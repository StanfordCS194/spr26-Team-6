import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-govbid-surface px-6 text-center">
      <h1 className="text-lg font-bold text-govbid-text">Sign-in link problem</h1>
      <p className="max-w-md text-sm text-govbid-text-muted">
        This confirmation or redirect link may have expired or was already used. Sign in with email and password, or request a new confirmation email from the login page if you just signed up.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-govbid-primary px-4 py-2 text-sm font-semibold text-white"
      >
        Back to login
      </Link>
    </div>
  );
}
