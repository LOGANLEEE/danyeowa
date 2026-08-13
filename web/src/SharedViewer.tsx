import { useEffect, useState } from "react";
import type { SharedView } from "@danyeowa/shared";
import { getSharedView } from "./api";
import { deriveHeroStatus, formatDate, formatDateRange, tripLengthDays, upcomingTrips } from "./sharedHero";

type Props = {
  token: string;
  /** Injected for testability; defaults to the real current time in production. */
  now?: Date;
};

/** Public, unlisted family viewer for a shared roster link — no auth, no tabs, no app chrome.
 * Reachable at /share/:token (see App.tsx routing), and must never issue an /api/me or
 * /api/auth request: a family member opening this link has no account and no session. */
export default function SharedViewer({ token, now }: Props) {
  const [view, setView] = useState<SharedView | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    getSharedView(token).then((result) => {
      if (!cancelled) setView(result);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (view === "loading") {
    return (
      <div
        data-testid="shared-loading"
        className="flex w-full max-w-xl flex-col gap-4 px-4 py-6"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="h-4 w-32 animate-pulse rounded bg-raised" />
        <div className="h-24 w-full animate-pulse rounded-lg bg-raised" />
        <div className="h-16 w-full animate-pulse rounded-lg bg-raised" />
      </div>
    );
  }

  if (view === null) {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-2 px-4 py-16 text-center">
        <p data-testid="shared-inactive" className="text-lg font-semibold text-ink">
          This link is no longer active
        </p>
      </div>
    );
  }

  const nowMs = (now ?? new Date()).getTime();
  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const status = deriveHeroStatus(view.trips, nowMs, viewerTz);
  const upcoming = upcomingTrips(view.trips, nowMs, viewerTz);

  return (
    <div className="flex w-full max-w-xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-ink-muted">danyeowa</p>
        <h1 className="text-lg font-semibold text-ink">{view.crewName}'s schedule</h1>
      </header>

      <div
        data-testid="shared-hero"
        className="flex flex-col gap-1 rounded-lg border border-edge bg-card p-5 text-center"
      >
        {status.kind === "away" ? (
          status.daysUntilHome === 0 ? (
            <>
              <p className="text-ink">
                In {status.awayCity} &mdash; home {status.homeWeekday}
              </p>
              <p className="num text-4xl font-semibold text-accent">Home today</p>
            </>
          ) : (
            <>
              <p className="text-ink">
                In {status.awayCity} &mdash; home {status.homeWeekday}
              </p>
              <p className="text-sm text-ink-muted">Home in</p>
              <p className="num text-4xl font-semibold text-accent">{status.daysUntilHome}</p>
              <p className="text-sm text-ink-muted">
                {status.daysUntilHome === 1 ? "day" : "days"}
              </p>
            </>
          )
        ) : status.kind === "home-upcoming" ? (
          <p className="text-ink">Home &mdash; next trip {formatDate(status.nextTripDate)}</p>
        ) : (
          <p className="text-ink">No trips planned</p>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-2">
          {upcoming.map((trip) => (
            <div
              key={`${trip.fromIso}-${trip.toIso}`}
              data-testid="shared-trip-row"
              className="flex flex-col gap-1 rounded-lg border border-edge bg-card p-4"
            >
              <p className="text-ink">
                {trip.awayCity} trip &middot; {formatDateRange(trip.fromIso, trip.toIso)} &middot; away{" "}
                {tripLengthDays(trip)} days
              </p>
              <p className="text-sm text-ink-muted">
                {trip.legs.map((leg) => leg.fromCity).concat(trip.legs.at(-1)?.toCity ?? "").join(" → ")}
              </p>
            </div>
          ))}
        </div>
      )}

      <footer className="pt-2 text-center text-xs text-ink-muted">Shared via danyeowa</footer>
    </div>
  );
}
