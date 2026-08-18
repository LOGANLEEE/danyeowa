import { useEffect, useState } from "react";
import type { InvitePreview } from "@danyeowa/shared";
import { getInvitePreview } from "./api";
import { authClient } from "./auth-client";
import GoogleButton from "./GoogleButton";
import Landing from "./Landing";

/**
 * A blurred sample of what the calendar looks like.
 *
 * Every value here is INVENTED. Blur is decoration, not protection — one line of CSS removes it —
 * so nothing real may be behind it. The API this page calls returns two strings and no schedule
 * data at all, which is what actually keeps a stranger from seeing anyone's roster.
 *
 * aria-hidden because it is illustrative furniture: a screen reader announcing fabricated flight
 * times as if they were the invitation's content would be worse than silence.
 */
function SamplePeek() {
  const marked = new Set([9, 10, 11, 17, 18, 24]);
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-edge bg-card">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none blur-[5px] motion-reduce:blur-[5px]"
      >
        <div className="flex flex-col gap-3 p-4">
          <p className="text-center text-sm text-ink-muted">August</p>
          <div className="grid grid-cols-7 gap-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span
                key={i}
                className="text-center text-[0.6rem] text-ink-muted"
              >
                {d}
              </span>
            ))}
            {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
              <span
                key={day}
                className={[
                  "num flex h-7 items-center justify-center rounded text-[0.7rem]",
                  marked.has(day)
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted",
                ].join(" ")}
              >
                {day}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1 rounded border border-edge bg-raised p-3 text-left">
            <p className="num text-xs text-ink-muted">DXB → AKL</p>
            <p className="num text-sm text-report">Report 08:45</p>
            <p className="num text-xs text-ink-muted">Lands 06:20</p>
          </div>
        </div>
      </div>

      {/* A bottom strip, not a full cover: the blurred month should stay readable AS texture —
          that is what conveys "this is a calendar of their days" — while the label makes sure
          nobody reads the invented numbers as real dates. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-card via-card/85 to-transparent px-4 pb-3 pt-8">
        <p className="text-center text-sm text-ink-muted">
          Sample — sign in to see the real dates
        </p>
      </div>
    </div>
  );
}

/**
 * What someone sees when they open an invite link without an account.
 *
 * Two stages on purpose. Landing an unknown visitor straight on an email field asks them to act
 * before they know what this is or why they should trust it; the first stage explains who invited
 * them and shows what they would get, and only then offers to sign in. Sign-in itself is
 * `Landing`'s existing OTP form, never a second implementation.
 *
 * A dead link (unknown, revoked, already accepted, or older than 7 days) skips straight to plain
 * sign-in rather than a dead end — the invitation is still waiting on the Share tab once in.
 *
 * Someone who already has a session gets neither stage. The API tells us whether that session is
 * the invited one, so the page either points them at the waiting invitation or explains the
 * mismatch — the case Google sign-in makes easy to fall into, since it hands over whatever
 * address the Google account carries and invites match on the exact address.
 */
export default function InviteLanding({ token }: { token: string }) {
  const [preview, setPreview] = useState<InvitePreview | null | "loading">(
    "loading",
  );
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInvitePreview(token)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (preview === "loading") {
    return (
      <div
        data-testid="invite-loading"
        className="flex w-full max-w-sm flex-col gap-4 px-4 py-6"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="h-8 w-32 animate-pulse rounded bg-raised motion-reduce:animate-none" />
        <div className="h-56 w-full animate-pulse rounded-lg bg-raised motion-reduce:animate-none" />
      </div>
    );
  }

  // Dead link, or they chose to continue: the sign-in surface, with the compact invite reminder.
  if (preview === null || signingIn) {
    return (
      <div className="flex min-h-dvh w-full flex-col items-center justify-center px-4 py-6">
        <Landing
          invite={preview}
          callbackURL={`/invite/${encodeURIComponent(token)}`}
          onSignedIn={() => location.replace("/?tab=share")}
        />
      </div>
    );
  }

  // Already signed in as the invited address. Nothing left to do but go and accept it.
  if (preview.matchesYou === true) {
    return (
      <Shell>
        <p
          data-testid="invite-headline"
          className="stagger-2 text-xl font-semibold text-ink text-balance"
        >
          {preview.fromName} wants you to know when they're back
        </p>
        <p className="text-sm text-ink-muted text-balance">
          You're signed in as{" "}
          <span className="num text-ink">{preview.signedInAs}</span>. The
          invitation is waiting for you.
        </p>
        <a
          data-testid="invite-open-app"
          href="/?tab=share"
          className="flex min-h-[48px] w-full items-center justify-center rounded bg-accent px-3 py-3 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
        >
          Accept {preview.fromName}'s invitation
        </a>
      </Shell>
    );
  }

  // Signed in as somebody else. Left alone this is a silent dead end: the app opens with no
  // invitation in it and nothing saying why. Say which address it went to instead.
  if (preview.matchesYou === false) {
    return (
      <Shell>
        <p
          data-testid="invite-mismatch"
          className="stagger-2 text-xl font-semibold text-ink text-balance"
        >
          This invitation went to a different address
        </p>
        <p className="text-sm text-ink-muted text-balance">
          You're signed in as{" "}
          <span className="num text-ink">{preview.signedInAs}</span>, but{" "}
          {preview.fromName} sent it to{" "}
          <span className="num text-ink">{preview.toEmailMasked}</span>. Sign in
          with that address, or ask {preview.fromName} to invite this one.
        </p>
        <button
          type="button"
          data-testid="invite-switch-account"
          onClick={async () => {
            await authClient.signOut();
            location.reload();
          }}
          className="min-h-[48px] w-full rounded bg-accent px-3 py-3 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
        >
          Sign in as someone else
        </button>
        <a href="/" className="text-sm text-ink-muted underline">
          Stay signed in as {preview.signedInAs}
        </a>
      </Shell>
    );
  }

  return (
    <Shell>
      <p
        data-testid="invite-headline"
        className="stagger-2 text-xl font-semibold text-ink text-balance"
      >
        {preview.fromName} wants you to know when they're back
      </p>
      <p className="text-sm text-ink-muted text-balance">
        They fly for a living. This is their roster — so you know when their day
        starts, when they land, and which days they're free.
      </p>

      <div data-testid="invite-peek" className="stagger-3 w-full">
        <SamplePeek />
      </div>

      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          data-testid="invite-continue"
          onClick={() => setSigningIn(true)}
          className="min-h-[48px] rounded bg-accent px-3 py-3 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
        >
          See {preview.fromName}'s roster
        </button>
        <p className="text-sm text-ink-muted text-balance">
          We'll email a 6-digit code to{" "}
          <span className="num text-ink">{preview.toEmailMasked}</span>. No
          password to make, and it takes about a minute.
        </p>
      </div>

      {/* Offered here as well as on the form: for someone whose Google address IS the invited
          one, this is the whole sign-in, and making them read past it to an email field is
          asking for work they do not need to do. */}
      <div className="flex w-full items-center gap-2 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-edge" aria-hidden="true" />
        or
        <span className="h-px flex-1 bg-edge" aria-hidden="true" />
      </div>
      <GoogleButton
        callbackURL={`/invite/${encodeURIComponent(token)}`}
        onError={setError}
      />

      {error && (
        <p role="alert" className="text-sm text-ink-muted">
          {error}
        </p>
      )}
    </Shell>
  );
}

/** The centred column every signed-in-state screen here shares. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center px-4 py-8">
      <div className="entrance flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <h1 className="stagger-1 text-3xl font-semibold text-ink">danyeowa</h1>
        {children}
      </div>
    </div>
  );
}
