import { useState } from "react";
import type { Flight, LegPatch } from "@roaster/shared";
import { formatLocal, wallToUtc } from "@roaster/shared";
import { deleteTrip, patchFlight } from "./api";
import type { TripWithFlights } from "./api";

type Props = { trip: TripWithFlights; onDone: () => void; onBack: () => void };

type LegEdits = { dep: string; arr: string; report: string };

/** Converts a UTC ISO instant to a local wall `YYYY-MM-DDTHH:mm` string in the given tz. */
function utcToDatetimeLocal(utcIso: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcIso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Converts a `YYYY-MM-DDTHH:mm` datetime-local value to the wall-ISO seconds format wallToUtc expects. */
function toWallIso(datetimeLocal: string): string {
  return datetimeLocal.length === 16 ? `${datetimeLocal}:00` : datetimeLocal;
}

function legEditsFrom(flight: Flight): LegEdits {
  return {
    dep: utcToDatetimeLocal(flight.depUtc, flight.depTz),
    arr: utcToDatetimeLocal(flight.arrUtc, flight.arrTz),
    report: utcToDatetimeLocal(flight.reportUtc, flight.depTz),
  };
}

export default function TripDetail({ trip, onDone, onBack }: Props) {
  const [flights, setFlights] = useState<Flight[]>(trip.flights);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<LegEdits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function startEdit(flight: Flight) {
    setEditingId(flight.id);
    setEdits(legEditsFrom(flight));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEdits(null);
    setError(null);
  }

  async function saveEdit(flight: Flight) {
    if (!edits) return;
    setError(null);

    const patch: LegPatch = {};
    const depUtc = wallToUtc(toWallIso(edits.dep), flight.depTz);
    const arrUtc = wallToUtc(toWallIso(edits.arr), flight.arrTz);
    const reportUtc = wallToUtc(toWallIso(edits.report), flight.depTz);
    if (depUtc !== flight.depUtc) patch.depUtc = depUtc;
    if (arrUtc !== flight.arrUtc) patch.arrUtc = arrUtc;
    if (reportUtc !== flight.reportUtc) patch.reportUtc = reportUtc;

    if (Object.keys(patch).length === 0) {
      cancelEdit();
      return;
    }

    setSaving(true);
    try {
      const updated = await patchFlight(flight.id, patch);
      setFlights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update flight");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteTrip(trip.id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete trip");
      setDeleting(false);
    }
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start rounded border border-edge px-3 py-2 text-ink hover:border-ink-muted"
      >
        Back
      </button>

      <div className="flex flex-col gap-3">
        {flights.map((flight) => {
          const isEditing = editingId === flight.id;
          return (
            <div key={flight.id} className="flex flex-col gap-2 rounded-lg border border-edge bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-ink-bright">
                  {flight.origin} → {flight.dest} <span className="text-ink-muted">{flight.flightNo}</span>
                </p>
                {!isEditing && (
                  <button
                    type="button"
                    data-testid="edit-leg"
                    onClick={() => startEdit(flight)}
                    className="rounded border border-edge px-2 py-1 text-sm text-ink hover:border-ink-muted"
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditing && edits ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`dep-${flight.id}`} className="text-sm text-ink-muted">
                    Departure (local)
                  </label>
                  <input
                    id={`dep-${flight.id}`}
                    type="datetime-local"
                    value={edits.dep}
                    onChange={(e) => setEdits({ ...edits, dep: e.target.value })}
                    className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none focus:border-amber"
                  />

                  <label htmlFor={`arr-${flight.id}`} className="text-sm text-ink-muted">
                    Arrival (local)
                  </label>
                  <input
                    id={`arr-${flight.id}`}
                    type="datetime-local"
                    value={edits.arr}
                    onChange={(e) => setEdits({ ...edits, arr: e.target.value })}
                    className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none focus:border-amber"
                  />

                  <label htmlFor={`report-${flight.id}`} className="text-sm text-amber">
                    Report (local)
                  </label>
                  <input
                    id={`report-${flight.id}`}
                    type="datetime-local"
                    value={edits.report}
                    onChange={(e) => setEdits({ ...edits, report: e.target.value })}
                    className="num rounded border border-edge bg-raised px-3 py-2 text-amber-num outline-none focus:border-amber"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="save-leg"
                      disabled={saving}
                      onClick={() => saveEdit(flight)}
                      className="rounded bg-amber px-3 py-2 font-medium text-ground hover:brightness-110 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded border border-edge px-3 py-2 text-ink hover:border-ink-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="num text-sm text-ink-muted">
                  dep {formatLocal(flight.depUtc, flight.depTz)} → arr{" "}
                  {formatLocal(flight.arrUtc, flight.arrTz)}
                </p>
              )}

              {!isEditing && (
                <p className="num text-sm text-amber-num">Report {formatLocal(flight.reportUtc, flight.depTz)}</p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-sm text-ink-muted">
          {error}
        </p>
      )}

      {confirmingDelete ? (
        <div className="flex flex-col gap-2 rounded-lg border border-edge bg-raised p-4">
          <p className="text-ink-bright">Delete trip? This can't be undone.</p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="confirm-delete"
              disabled={deleting}
              onClick={confirmDelete}
              className="rounded bg-raised px-3 py-2 font-medium text-ink-bright border border-edge hover:border-ink-muted disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded border border-edge px-3 py-2 text-ink hover:border-ink-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="delete-trip"
          onClick={() => setConfirmingDelete(true)}
          className="self-start rounded border border-edge px-3 py-2 text-ink hover:border-ink-muted"
        >
          Delete trip
        </button>
      )}
    </div>
  );
}
