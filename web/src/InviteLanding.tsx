import { useEffect, useState } from "react";
import type { InvitePreview } from "@danyeowa/shared";
import { getInvitePreview } from "./api";
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
              <span key={i} className="text-center text-[0.6rem] text-ink-muted">
                {d}
              </span>
            ))}
            {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
              <span
                key={day}
                className={[
                  "num flex h-7 items-center justify-center rounded text-[0.7rem]",
                  marked.has(day) ? "bg-accent-soft text-accent" : "text-ink-muted",
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
        <p className="text-center text-sm text-ink-muted">Sample — sign in to see the real dates</p>
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
 */
export default function InviteLanding({ token }: { token: string }) {
  const [preview, setPreview] = useState<InvitePreview | null | "loading">("loading");
  const [signingIn, setSigningIn] = useState(false);

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
        <Landing invite={preview} onSignedIn={() => location.replace("/")} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center px-4 py-8">
      <div className="entrance flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <h1 className="stagger-1 text-3xl font-semibold text-ink">danyeowa</h1>

        <div className="stagger-2 flex flex-col gap-2">
          <p data-testid="invite-headline" className="text-xl font-semibold text-ink text-balance">
            {preview.fromName} wants you to know when they're back
          </p>
          <p className="text-sm text-ink-muted text-balance">
            They fly for a living. This is their roster — so you know when their day starts, when
            they land, and which days they're free.
          </p>
        </div>

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
            <span className="num text-ink">{preview.toEmailMasked}</span>. No password to make, and
            it takes about a minute.
          </p>
        </div>
      </div>
    </div>
  );
}
