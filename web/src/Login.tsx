import { useState } from "react";
import { authClient } from "./auth-client";

type Props = { onSignedIn: () => void; onBack?: () => void };

export default function Login({ onSignedIn, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setError(null);
    try {
      const { error: signInError } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (signInError) {
        setError(signInError.message ?? "Failed to sign in with Google");
      }
    } catch {
      setError("Couldn't start Google sign-in — check your connection");
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      if (sendError) {
        setError(sendError.message ?? "Failed to send code");
        return;
      }
      setCodeSent(true);
    } catch {
      setError("Couldn't send the code — check your connection");
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { error: signInError } = await authClient.signIn.emailOtp({ email, otp: code });
      if (signInError) {
        setError(signInError.message ?? "Failed to sign in");
        return;
      }
      onSignedIn();
    } catch {
      setError("Sign-in failed — try again");
    }
  }

  if (!codeSent) {
    return (
      <form
        onSubmit={handleSendCode}
        className="entrance flex w-full max-w-sm flex-col gap-3 rounded-lg border border-edge bg-card p-6"
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="self-start text-sm text-ink-muted transition-colors duration-[120ms] hover:text-ink"
          >
            ← back
          </button>
        )}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="flex items-center justify-center gap-2 rounded border border-edge bg-card px-3 py-2 font-medium text-ink transition-colors duration-[120ms] hover:bg-raised"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.68-3.88 2.68-6.62Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"
            />
            <path
              fill="#FBBC05"
              d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
            />
          </svg>
          Continue with Google
        </button>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="h-px flex-1 bg-edge" aria-hidden="true" />
          or use email code
          <span className="h-px flex-1 bg-edge" aria-hidden="true" />
        </div>
        <label htmlFor="login-email" className="text-sm text-ink-muted">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
        />
        <button
          type="submit"
          className="rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
        >
          Send code
        </button>
        {error && (
          <p role="alert" className="text-sm text-ink-muted">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSignIn}
      className="entrance flex w-full max-w-sm flex-col gap-3 rounded-lg border border-edge bg-card p-6"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="self-start text-sm text-ink-muted transition-colors duration-[120ms] hover:text-ink"
        >
          ← back
        </button>
      )}
      <label htmlFor="login-code" className="text-sm text-ink-muted">
        Code
      </label>
      <input
        id="login-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
      />
      <button
        type="submit"
        className="rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
      >
        Sign in
      </button>
      {error && (
        <p role="alert" className="text-sm text-ink-muted">
          {error}
        </p>
      )}
    </form>
  );
}
