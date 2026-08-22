import { useEffect, useState } from "react";
import { formatDuration } from "@danyeowa/shared";
import { useAirport } from "./lib/airports";
import { formatLayoverBrief, type LayoverRest } from "./lib/layoverBrief";
import { fetchLayoverForecast, layoverDates, type DayForecast } from "./lib/weather";

/** What the forecast lookup currently knows. "loading" is not the same as "none": while the
 * request is in flight there are no grounds to say *why* there is no forecast, and the first
 * version said "usually available about two weeks ahead" during the fetch — an explanation for
 * a conclusion it had not reached yet. */
type ForecastState =
  | { kind: "unavailable" } // station has no coordinates, so there can never be one
  | { kind: "loading" }
  | { kind: "none" } // asked, and there genuinely isn't one
  | { kind: "ready"; days: DayForecast[] };

/**
 * The layover panel: how long she is actually free, what the sky is doing, and a button that
 * packs the roster context into text for whichever assistant she already uses.
 *
 * Laid out around ONE number. Free-until-report is the only figure here that exists nowhere
 * else in the app and that no assistant can work out on its own, so it reads as the headline
 * and everything else sits under a rule beneath it. The first version stacked seven things of
 * equal weight and buried the one that mattered.
 *
 * Why a clipboard button and not four API integrations: weather, attractions, local transport
 * and what's on each carry their own licence, coverage gap and running cost, and between them
 * they cover this network badly — events data thins out across exactly the Middle East and
 * South Asia she flies to most. An assistant answers all four anywhere. The one thing it cannot
 * know is the roster, which is the one thing this app has.
 */
export function CopyLayoverBrief({ rest }: { rest: LayoverRest }) {
  const airport = useAirport(rest.station);
  const [hotel, setHotel] = useState("");
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastState>({ kind: "loading" });

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  // A new day's rest must not inherit the last one's hotel.
  useEffect(() => {
    setHotel("");
    setFallbackText(null);
  }, [rest.station, rest.arrUtc]);

  const lat = airport?.lat;
  const lng = airport?.lng;

  useEffect(() => {
    // `undefined` means the airport lookup itself hasn't landed yet — still loading, not "no
    // coordinates". Only an explicit null is a station that can never carry a forecast.
    if (airport === undefined) {
      setForecast({ kind: "loading" });
      return;
    }
    if (lat == null || lng == null) {
      setForecast({ kind: "unavailable" });
      return;
    }

    setForecast({ kind: "loading" });
    let cancelled = false;
    void fetchLayoverForecast(lat, lng, rest.arrTz, layoverDates(rest)).then((days) => {
      if (cancelled) return;
      setForecast(days ? { kind: "ready", days } : { kind: "none" });
    });
    return () => {
      cancelled = true;
    };
  }, [airport, lat, lng, rest]);

  async function copy() {
    const text = formatLayoverBrief(rest, {
      city: airport?.city,
      hotel,
      forecast: forecast.kind === "ready" ? forecast.days : null,
    });
    try {
      await navigator.clipboard.writeText(text);
      setFallbackText(null);
      setCopied(true);
    } catch {
      // Clipboard access can be refused outright (insecure context, a locked-down webview).
      // Showing the text beats a dead button — she can still select it by hand.
      setFallbackText(text);
    }
  }

  const city = airport?.city ?? rest.station;

  return (
    <section
      data-testid="layover-brief"
      className="hairline mt-3 flex flex-col rounded-lg border border-edge bg-card p-4"
    >
      <p className="text-xs uppercase tracking-[0.12em] text-ink-muted">Layover · {city}</p>

      {/* The headline. Baseline-aligned so the unit reads as part of the figure rather than a
          second thing to parse. */}
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span
          data-testid="layover-free"
          className="num text-3xl font-semibold leading-none text-ink"
        >
          {formatDuration(rest.arrUtc, rest.nextReportUtc)}
        </span>
        <span className="text-sm text-ink-muted">free until report</span>
      </p>

      {forecast.kind !== "unavailable" && (
        <div className="mt-3 border-t border-edge pt-3">
          {forecast.kind === "loading" && (
            <p data-testid="layover-weather-loading" className="text-sm text-ink-muted">
              Checking the forecast…
            </p>
          )}

          {forecast.kind === "none" && (
            // Not a failure and not worth hiding: forecasts only run about two weeks out, and a
            // roster is published a month ahead, so this is the normal state for most layovers.
            // Saying so beats a silent gap — and beats a seasonal average dressed as a forecast.
            <p data-testid="layover-weather-pending" className="text-sm text-ink-muted">
              No forecast yet — usually available about two weeks ahead.
            </p>
          )}

          {forecast.kind === "ready" && (
            <div data-testid="layover-weather" className="flex flex-col gap-1.5">
              {forecast.days.map((day) => (
                <p key={day.date} className="flex items-baseline gap-2 text-sm">
                  <span className="num w-11 shrink-0 text-ink-muted">{day.date.slice(5)}</span>
                  <span className="num w-16 shrink-0 text-ink">
                    {Math.round(day.tempMinC)}–{Math.round(day.tempMaxC)}°
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-muted">{day.label}</span>
                  <span className="num shrink-0 text-ink-muted">
                    {day.rainChance == null ? "—" : `${day.rainChance}%`}
                  </span>
                  {/* Sunset, not sunrise: on a layover the question is how much light is left,
                      and it comes free with the forecast already fetched. */}
                  <span className="num shrink-0 text-ink-muted" title="Sunset">
                    ↓{day.sunset.slice(11, 16)}
                  </span>
                </p>
              ))}
              <p className="mt-0.5 text-xs text-ink-muted">
                Forecast ·{" "}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Open-Meteo
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pointers, not a second copy of the data. A city guide and a what's-on search are two
          links; mirroring either dataset into this app would mean a licence, a coverage gap and
          a table that goes stale — and the assistant already answers both from the brief.
          Chips rather than inline links: a bare text link is a ~20px tap target. */}
      {airport?.city && (
        <div data-testid="layover-lookup" className="mt-3 flex gap-2 border-t border-edge pt-3">
          {[
            {
              label: "City guide",
              href: `https://en.wikivoyage.org/w/index.php?search=${encodeURIComponent(airport.city)}`,
            },
            {
              label: "What's on",
              href: `https://www.google.com/search?q=${encodeURIComponent(`events in ${airport.city} this week`)}`,
            },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-md border border-edge text-sm text-accent transition-colors duration-[120ms] hover:border-accent"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}

      <label className="mt-3 flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Hotel (optional — sharpens the answer)</span>
        {/* No `text-sm` here on purpose: it would beat the 16px floor in tokens.css and iOS
            would zoom the whole layout on focus. */}
        <input
          data-testid="layover-hotel"
          type="text"
          value={hotel}
          onChange={(e) => setHotel(e.target.value)}
          placeholder="e.g. Rydges Sydney Central"
          className="min-h-[44px] rounded-md border border-edge bg-ground px-3 text-ink placeholder:text-ink-muted"
        />
      </label>

      <button
        type="button"
        data-testid="copy-layover-brief"
        onClick={copy}
        className="mt-2 flex min-h-[44px] items-center justify-center rounded-md bg-accent px-4 font-semibold text-card transition-opacity duration-[120ms] hover:opacity-90"
      >
        {copied ? "Copied" : "Copy layover brief"}
      </button>
      <p className="mt-1.5 text-center text-xs text-ink-muted">
        Paste into ChatGPT, Gemini or Claude
      </p>

      {fallbackText && (
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-xs text-ink-muted">Copy failed — select and copy this:</span>
          <textarea
            data-testid="layover-brief-fallback"
            readOnly
            rows={8}
            value={fallbackText}
            className="w-full rounded-md border border-edge bg-ground p-2 text-ink"
          />
        </label>
      )}
    </section>
  );
}
