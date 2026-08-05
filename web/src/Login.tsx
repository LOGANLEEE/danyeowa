import { useState } from "react";
import { authClient } from "./auth-client";

type Props = { onSignedIn: () => void };

export default function Login({ onSignedIn }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    if (sendError) {
      setError(sendError.message ?? "Failed to send code");
      return;
    }
    setCodeSent(true);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: signInError } = await authClient.signIn.emailOtp({ email, otp: code });
    if (signInError) {
      setError(signInError.message ?? "Failed to sign in");
      return;
    }
    onSignedIn();
  }

  if (!codeSent) {
    return (
      <form onSubmit={handleSendCode} className="flex flex-col gap-2">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit">Send code</button>
        {error && <p role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={handleSignIn} className="flex flex-col gap-2">
      <label htmlFor="login-code">Code</label>
      <input
        id="login-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit">Sign in</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
