import { useEffect, useState } from "react";
import type { InvitePreview } from "@danyeowa/shared";
import { getInvitePreview } from "./api";
import Landing from "./Landing";

/**
 * What someone sees when they open an invite link without an account.
 *
 * The point is conversion: an anonymous sign-in form gives a stranger no reason to trust it, so
 * this shows who invited them and what signing in gets them. It shows nothing about the roster —
 * the API behind it returns two strings and no schedule data at all.
 *
 * Sign-in itself is `Landing`'s existing OTP form, not a second implementation of it. On a dead
 * link (unknown, revoked, already accepted, or older than 7 days) the preview is simply absent
 * and the plain sign-in screen renders — an expired link should not be a dead end, because the
 * invitation itself is still waiting on the Share tab once they are in.
 */
export default function InviteLanding({ token }: { token: string }) {
  const [preview, setPreview] = useState<InvitePreview | null | "loading">("loading");

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
        <div className="h-28 w-full animate-pulse rounded-lg bg-raised motion-reduce:animate-none" />
      </div>
    );
  }

  // Signing in from here lands on the app itself; the invitation is on the Share tab.
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center px-4 py-6">
      <Landing invite={preview} onSignedIn={() => location.replace("/")} />
    </div>
  );
}
