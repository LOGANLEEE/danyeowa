import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatLocal } from "@roaster/shared";
import { digitsOf, getAirlinePrefix } from "./lib/airlinePrefix";
import type { TripWithFlights } from "./api";
import { useTripEntry } from "./useTripEntry";
import type { UseTripEntryReturn } from "./useTripEntry";

type Props = {
  /** Local ISO date ("YYYY-MM-DD") this sheet is open for. */
  isoDate: string;
  /** All trips already fetched by the caller — used for recent-flight chips and to skip
   * occupied days when suggesting the next rapid-entry date. No extra fetch. */
  trips: TripWithFlights[];
  homeTz: string;
  onClose: () => void;
  /** Called once, on dismiss (Done / scrim / close / Escape) — caller should refetch trips.
   * NOT called per-add during rapid entry, to keep chaining snappy. */
  onChanged: () => void;
  /** Called after each successful add with the isoDate that was added, so the caller can mark
   * the day optimistically (no refetch needed for that). */
  onAdded: (isoDate: string) => void;
};

/** Humanizes a local ISO calendar date ("YYYY-MM-DD") as "Wed 20 Aug" (weekday short + day
 * + month short) using the home tz's own calendar — reuses formatLocal's withDate branch
 * (weekday/day/month/hour/minute) by feeding it a synthetic noon-UTC instant for that
 * calendar date (noon avoids any tz day-boundary slippage for all realistic offsets), then
 * drops the time portion. */
export function humanDateLabel(isoDate: string, homeTz: string): string {
  return formatLocal(`${isoDate}T12:00:00.000Z`, homeTz, { withDate: true }).split(" ").slice(0, 3).join(" ");
}

function dayTitle(isoDate: string, homeTz: string): string {
  return `${humanDateLabel(isoDate, homeTz)} — add trip`;
}

/** Muted "+ add flight" control shown under the preview card while previewing a single
 * flight (hidden once a flight is already appended — the ✕ on the appended card is the only
 * way back to single-flight state). Tapping it reveals a small inline flight-no input; Enter
 * or the "add" button fires the second lookup via `entry.appendFlight`. A lookup miss shows
 * an inline muted error under the input — appended flights are schedule-known only, no
 * manual-mode fallback (manual turnarounds remain possible via the pre-existing multi-leg
 * manual path). */
function AppendFlightControl({ entry, airlinePrefix }: { entry: UseTripEntryReturn; airlinePrefix: string }) {
  const [expanded, setExpanded] = useState(false);
  const [digits, setDigits] = useState("");
  const value = airlinePrefix + digits;

  if (!expanded) {
    return (
      <button
        type="button"
        data-testid="append-flight"
        onClick={() => setExpanded(true)}
        className="w-fit text-sm text-ink-muted underline transition-colors duration-[120ms] hover:text-ink"
      >
        + add flight
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 rounded border border-edge bg-card px-2 py-1 transition-colors duration-[120ms] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent">
          <span className="num text-ink-muted">{airlinePrefix}</span>
          <input
            data-testid="append-flightno-input"
            autoFocus
            inputMode="numeric"
            value={digits}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void entry.appendFlight(value);
              }
            }}
            placeholder="098"
            className="num w-16 bg-transparent text-ink outline-none focus-visible:outline-none"
          />
        </span>
        <button
          type="button"
          onClick={() => void entry.appendFlight(value)}
          className="min-h-[44px] rounded border border-edge px-3 py-1 text-sm text-ink transition-colors duration-[120ms] hover:border-ink-muted"
        >
          Add
        </button>
      </div>
      {entry.appendLookupMiss && (
        <p className="text-sm text-ink-muted">unknown flight — try another number</p>
      )}
    </div>
  );
}

/** Empty-day content: flight-no -> autofill preview -> "Add to roster", with an inline
 * manual fallback on a lookup miss. Driven entirely by useTripEntry. After a successful add,
 * chains into a rapid-entry "added" state (Plan 6 Task 5): the sheet stays open, the flight
 * field clears + refocuses, recent-flight chips offer a one-tap re-add, and a next-date
 * suggestion (skipping occupied days, including ones just added) advances the picked date for
 * the next entry — without a per-add refetch (the parent marks the day optimistically). */
function AddTripContent({
  isoDate,
  homeTz,
  trips,
  onDone,
  onAdded,
}: {
  isoDate: string;
  homeTz: string;
  trips: TripWithFlights[];
  /** Dismisses the sheet — fires the parent's single refetch, then closes. */
  onDone: () => void;
  onAdded: (isoDate: string) => void;
}) {
  const flightNoInputRef = useRef<HTMLInputElement>(null);
  const pickedDate = isoDate;
  const [airlinePrefix] = useState(getAirlinePrefix);

  // One flight per day is the norm, and a turnaround's second leg is appended to this same
  // preview before saving (see AppendFlightControl) — so a save ends the interaction. The
  // sheet closes, which fires the parent's refetch and puts the new mark on the grid.
  const entry = useTripEntry({
    pickedDate,
    homeTz,
    onSubmitted: () => {
      onAdded(pickedDate);
      onDone();
    },
  });

  useEffect(() => {
    if (entry.mode === "flightno") flightNoInputRef.current?.focus();
  }, [entry.mode]);

  if (entry.mode === "flightno") {
    return (
      <div className="flex flex-col gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void entry.handleAutofillSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <label htmlFor="flightno-input" className="text-sm text-ink-muted">
            Flight number
          </label>
          {/* The airline code is a setting, not something to retype on every entry — it is
              rendered as a fixed adornment and only the digits are typed. The value handed to
              the lookup is still the whole flight number. */}
          <div className="flex items-center gap-2 rounded border border-edge bg-raised px-3 py-2 transition-colors duration-[120ms] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent">
            <span className="num text-lg text-ink-muted">{airlinePrefix}</span>
            <input
              id="flightno-input"
              data-testid="flightno-input"
              ref={flightNoInputRef}
              autoFocus
              inputMode="numeric"
              value={digitsOf(entry.flightNo, airlinePrefix)}
              onChange={(e) => entry.setFlightNo(airlinePrefix + e.target.value.replace(/\D/g, ""))}
              placeholder="412"
              className="num w-full bg-transparent text-lg text-ink outline-none focus-visible:outline-none"
            />
          </div>

          {entry.autofillLegs && entry.autofillFlightNo && (() => {
            const outboundLegs = entry.autofillLegs.filter((leg) => leg.flightNo === entry.autofillFlightNo);
            const appendedLegs = entry.appendedFlightNo
              ? entry.autofillLegs.filter((leg) => leg.flightNo === entry.appendedFlightNo)
              : [];
            const renderLegFields = (leg: (typeof entry.autofillLegs)[number], index: number) => {
              return (
                <div key={leg.legSeq} className="flex flex-col gap-2 border-t border-edge pt-3 first:border-t-0 first:pt-0">
                  <p className="text-ink">
                    {leg.origin} → {leg.dest}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <label htmlFor={`autofill-dep-${leg.legSeq}`} className="text-sm text-ink-muted">
                      Dep
                    </label>
                    <input
                      id={`autofill-dep-${leg.legSeq}`}
                      data-testid="autofill-dep"
                      type="time"
                      value={leg.depTime}
                      onChange={(e) => entry.updateAutofillLeg(index, { depTime: e.target.value })}
                      className="num min-w-[5.5rem] rounded border border-edge bg-card px-2 py-1 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
                    />
                    <label htmlFor={`autofill-arr-${leg.legSeq}`} className="text-sm text-ink-muted">
                      Arr
                    </label>
                    <span className="inline-flex items-center gap-0.5">
                      <input
                        id={`autofill-arr-${leg.legSeq}`}
                        data-testid="autofill-arr"
                        type="time"
                        value={leg.arrTime}
                        onChange={(e) => entry.updateAutofillLeg(index, { arrTime: e.target.value })}
                        className="num min-w-[5.5rem] rounded border border-edge bg-card px-2 py-1 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
                      />
                      {leg.dayOffset > 0 && <sup className="num text-ink-muted">+{leg.dayOffset}</sup>}
                    </span>
                  </div>
                </div>
              );
            };

            return (
              <>
                <div data-testid="autofill-card" className="flex flex-col gap-3 rounded border border-edge bg-raised p-4">
                  {outboundLegs.map((leg, index) => renderLegFields(leg, index))}
                  <p className="text-sm text-ink-muted">times from schedule — edit if your roster differs</p>
                </div>

                {appendedLegs.length > 0 && (
                  <div data-testid="appended-card" className="flex flex-col gap-3 rounded border border-edge bg-raised p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-ink-muted">+ {entry.appendedFlightNo}</p>
                      <button
                        type="button"
                        data-testid="remove-appended"
                        aria-label="Remove appended flight"
                        onClick={entry.removeAppendedFlight}
                        className="min-h-[44px] min-w-[44px] rounded border border-edge px-2 text-ink-muted transition-colors duration-[120ms] hover:border-ink-muted"
                      >
                        ✕
                      </button>
                    </div>
                    {appendedLegs.map((leg, index) =>
                      renderLegFields(leg, outboundLegs.length + index),
                    )}
                  </div>
                )}

                {!entry.appendedFlightNo && <AppendFlightControl entry={entry} airlinePrefix={airlinePrefix} />}

                <button
                  type="submit"
                  disabled={entry.submitting || entry.resolving}
                  className="min-h-[48px] rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                >
                  Add to roster
                </button>
              </>
            );
          })()}

        {entry.resolving && (
          <p data-testid="schedule-loading" className="text-sm text-ink-muted">
            checking schedule…
          </p>
        )}

        {/* Manual entry is a miss-only fallback: the schedule provider is the source of truth,
            so the link stays hidden until a lookup actually comes back empty. */}
        {entry.lookupMiss && !entry.autofillLegs && !entry.resolving && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-muted">unknown flight — enter details</p>
            <button
              type="button"
              data-testid="manual-expand"
              onClick={entry.switchToManual}
              className="w-fit text-sm text-ink-muted underline transition-colors duration-[120ms] hover:text-ink"
            >
              enter manually
            </button>
          </div>
        )}

        {entry.error && (
          <p role="alert" className="text-sm text-ink-muted">
            {entry.error}
          </p>
        )}
        </form>

      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void entry.handleManualSubmit();
      }}
      className="flex flex-col gap-4"
    >
      {entry.legs.map((leg, index) => {
        const originInfo = entry.airportLabel(leg.origin);
        const destInfo = entry.airportLabel(leg.dest);
        return (
          <fieldset key={index} className="flex flex-col gap-2 border-t border-edge pt-3 first:border-t-0 first:pt-0">
            <label htmlFor={`flight-no-${index}`} className="text-sm text-ink-muted">
              Flight no
            </label>
            <input
              id={`flight-no-${index}`}
              value={leg.flightNo}
              onChange={(e) => entry.updateLeg(index, { flightNo: e.target.value.toUpperCase() })}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />

            <label htmlFor={`origin-${index}`} className="text-sm text-ink-muted">
              Origin
            </label>
            <input
              id={`origin-${index}`}
              value={leg.origin}
              onChange={(e) => entry.updateLeg(index, { origin: e.target.value.toUpperCase() })}
              onBlur={(e) => entry.lookupAirport(e.target.value)}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />
            {originInfo && <p className="text-sm text-ink-muted">{originInfo}</p>}

            <label htmlFor={`dest-${index}`} className="text-sm text-ink-muted">
              Dest
            </label>
            <input
              id={`dest-${index}`}
              value={leg.dest}
              onChange={(e) => entry.updateLeg(index, { dest: e.target.value.toUpperCase() })}
              onBlur={(e) => entry.lookupAirport(e.target.value)}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />
            {destInfo && <p className="text-sm text-ink-muted">{destInfo}</p>}

            <label htmlFor={`dep-${index}`} className="text-sm text-ink-muted">
              Departure (local)
            </label>
            <input
              id={`dep-${index}`}
              type="datetime-local"
              value={leg.dep}
              onChange={(e) => entry.updateLeg(index, { dep: e.target.value })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />

            <label htmlFor={`arr-${index}`} className="text-sm text-ink-muted">
              Arrival (local)
            </label>
            <input
              id={`arr-${index}`}
              type="datetime-local"
              value={leg.arr}
              onChange={(e) => entry.updateLeg(index, { arr: e.target.value })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />
          </fieldset>
        );
      })}

      <button
        type="button"
        onClick={entry.addLeg}
        className="min-h-[48px] rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
      >
        Add leg
      </button>

      <button
        type="submit"
        disabled={entry.submitting}
        className="min-h-[48px] rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
      >
        Add to roster
      </button>

      {entry.error && (
        <p role="alert" className="text-sm text-ink-muted">
          {entry.error}
        </p>
      )}
    </form>
  );
}

/** Bottom sheet: tap any calendar day to view its trip (edit/delete) or add one on an empty
 * day. Fixed, portal-rendered, dismissible via scrim tap or Escape. Focus moves into the
 * sheet on open and returns to the previously focused element on close. */
export default function DaySheet({ isoDate, trips, homeTz, onClose, onChanged, onAdded }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Captured lazily on the initial render (before any effects run) so it reflects whatever
  // had focus BEFORE the sheet opened, not a child's own autofocus effect (e.g. the add
  // flow's flight-no input) — child effects fire before a parent's, so capturing this in a
  // useEffect would already see the child's autofocus result instead of the true prior focus.
  const previouslyFocused = useRef<HTMLElement | null>(null);
  if (previouslyFocused.current === null) {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
  }

  // Single dismiss path for scrim/close-button/Escape/"Done for now" - fires exactly one
  // refetch (onChanged) regardless of how many adds happened during rapid entry, then closes.
  function handleDismiss() {
    onChanged();
    onClose();
  }

  useEffect(() => {
    sheetRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleDismiss();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, onChanged]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        data-testid="sheet-scrim"
        aria-label="Close"
        onClick={handleDismiss}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={sheetRef}
        data-testid="day-sheet"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="entrance relative flex max-h-[85vh] flex-col gap-4 overflow-y-auto rounded-t-[22px] border-t border-edge bg-card p-4 outline-none"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-edge" aria-hidden="true" />

        <div className="flex items-center justify-between">
          <p className="font-semibold text-ink">{dayTitle(isoDate, homeTz)}</p>
          <button
            type="button"
            data-testid="sheet-close"
            aria-label="Close"
            onClick={handleDismiss}
            className="min-h-[44px] rounded border border-edge px-3 py-1 text-sm text-ink-muted transition-colors duration-[120ms] hover:border-ink-muted"
          >
            Close
          </button>
        </div>

        <AddTripContent
          isoDate={isoDate}
          homeTz={homeTz}
          trips={trips}
          onDone={handleDismiss}
          onAdded={onAdded}
        />
      </div>
    </div>,
    document.body,
  );
}
