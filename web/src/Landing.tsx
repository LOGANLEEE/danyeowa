import { useState } from "react";
import { authClient } from "./auth-client";

type Props = { onSignedIn: () => void };

/** Single-surface signed-out screen: wordmark, a static "next duty" departure-board sample,
 * and the sign-in form inline beneath it. There is no separate login screen to navigate to —
 * the email step and the OTP-code step live on this one surface, the code field simply
 * appearing under the email field once a code has been sent. */
export default function Landing({ onSignedIn }: Props) {
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

  return (
    <div className="entrance flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <h1 className="stagger-1 text-3xl font-semibold text-ink">
        danyeowa
      </h1>

      {/* Departure-board panel: static illustrative sample, not live schedule data. It stays
          visually dark in both the light and dark app themes on purpose — it's meant to read
          as a physical airport board, not as themed app chrome — so it uses fixed color values
          instead of the ink/card/edge tokens, which flip between themes. */}
      <div className="stagger-2 flex w-full flex-col gap-1 rounded-lg border border-white/10 bg-[#0b0d12] p-4 text-left shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">Next duty</p>
        <dl className="num flex flex-col text-sm text-white/90">
          <div className="flex items-baseline justify-between border-b border-dashed border-white/15 py-1.5">
            <dt className="text-white/50">EK448</dt>
            <dd>DXB → AKL</dd>
          </div>
          <div className="flex items-baseline justify-between border-b border-dashed border-white/15 py-1.5">
            <dt className="text-white/50">REPORT</dt>
            {/* Fixed amber, matching the dark theme's --color-report — same reason as the panel
                itself: this must read as "report" regardless of the app's light/dark theme. */}
            <dd className="text-[#ffd57e]">08:45</dd>
          </div>
          <div className="flex items-baseline justify-between border-b border-dashed border-white/15 py-1.5">
            <dt className="text-white/50">DEP</dt>
            <dd>10:45</dd>
          </div>
          <div className="flex items-baseline justify-between py-1.5">
            <dt className="text-white/50">ARR</dt>
            <dd>
              06:20<sup>+1</sup>
            </dd>
          </div>
        </dl>
      </div>

      <form onSubmit={codeSent ? handleSignIn : handleSendCode} className="stagger-3 flex w-full flex-col gap-3 text-left">
        <label htmlFor="landing-email" className="text-sm text-ink-muted">
          Email
        </label>
        <input
          id="landing-email"
          type="email"
          autoComplete="email"
          required
          disabled={codeSent}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-edge bg-raised px-3 py-3 text-ink outline-none transition-colors duration-[120ms] focus:border-accent disabled:opacity-60"
        />

        {!codeSent ? (
          <button
            type="submit"
            className="rounded bg-accent px-3 py-3 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
          >
            Send code
          </button>
        ) : (
          <>
            <p className="text-sm text-ink-muted">Code sent to {email}</p>
            <label htmlFor="landing-code" className="text-sm text-ink-muted">
              Code
            </label>
            <input
              id="landing-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="num rounded border border-edge bg-raised px-3 py-3 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />
            <button
              type="submit"
              className="rounded bg-accent px-3 py-3 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
            >
              Sign in
            </button>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-ink-muted">
            {error}
          </p>
        )}
      </form>

      <div className="flex w-full items-center gap-2 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-edge" aria-hidden="true" />
        or
        <span className="h-px flex-1 bg-edge" aria-hidden="true" />
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        className="flex w-full items-center justify-center gap-2 rounded border border-edge bg-card px-3 py-3 font-medium text-ink transition-colors duration-[120ms] hover:bg-raised"
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
    </div>
  );
}
