import { useState } from "react";
import { formatLocal } from "@roaster/shared";
import { deleteTrip } from "./api";
import type { TripWithFlights } from "./api";

/** Same stroke-icon vocabulary as the tab bar (see TabBar.tsx's ICON_PROPS). */
function TrashIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4h6v3" />
    </svg>
  );
}

/**
 * A trip's legs plus delete-with-confirm, rendered inline wherever the trip is shown — the
 * day card on the calendar owns this now, so viewing or removing a trip never opens a sheet.
 * Times are read-only: they come from the schedule provider, not the crew.
 */
export default function TripLegsPanel({
  trip,
  onChanged,
}: {
  trip: TripWithFlights;
  /** Fired after a successful delete so the caller can refetch. */
  onChanged: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteTrip(trip.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete trip");
      setDeleting(false);
    }
  }

  return (
    <div data-testid="trip-legs-panel" className="flex flex-col gap-3">
      {[...trip.flights]
        .sort((a, b) => a.legSeq - b.legSeq)
        .map((flight) => (
          <div key={flight.id} className="flex flex-col gap-1 rounded-lg border border-edge bg-raised p-3">
            <p className="text-ink">
              {flight.origin} → {flight.dest} <span className="text-ink-muted">{flight.flightNo}</span>
            </p>
            <p className="num text-sm text-ink-muted">
              dep {formatLocal(flight.depUtc, flight.depTz)} → arr {formatLocal(flight.arrUtc, flight.arrTz)}
            </p>
            <p className="num text-sm text-report">Report {formatLocal(flight.reportUtc, flight.depTz)}</p>
          </div>
        ))}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {confirmingDelete ? (
        <div className="flex flex-col gap-2 rounded-lg border border-edge bg-raised p-3">
          <p className="text-ink">Delete trip? This can't be undone.</p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="confirm-delete"
              disabled={deleting}
              onClick={confirmDelete}
              className="min-h-[48px] rounded border border-danger px-3 py-2 font-medium text-danger transition-colors duration-[120ms] hover:bg-danger/10 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="min-h-[48px] rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="delete-trip"
          aria-label="Delete trip"
          title="Delete trip"
          onClick={() => setConfirmingDelete(true)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center self-start rounded text-ink-muted transition-colors duration-[120ms] hover:text-danger"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}
