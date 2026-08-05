import { useState } from "react";
import { authClient } from "./auth-client";

type Props = { onSignedIn: () => void; onBack?: () => void };

export default function Login({ onSignedIn, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-edge bg-surface p-6"
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="self-start text-sm text-ink-muted hover:text-ink"
          >
            ← back
          </button>
        )}
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
          className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none focus:border-amber"
        />
        <button
          type="submit"
          className="rounded bg-amber px-3 py-2 font-medium text-ground hover:brightness-110"
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
      className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-edge bg-surface p-6"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="self-start text-sm text-ink-muted hover:text-ink"
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
        className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none focus:border-amber"
      />
      <button
        type="submit"
        className="rounded bg-amber px-3 py-2 font-medium text-ground hover:brightness-110"
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
