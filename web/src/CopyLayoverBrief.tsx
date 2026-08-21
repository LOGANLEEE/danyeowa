import { useEffect, useState } from "react";
import { formatDuration } from "@danyeowa/shared";
import { useAirport } from "./lib/airports";
import { formatLayoverBrief, type LayoverRest } from "./lib/layoverBrief";
import { fetchLayoverForecast, layoverDates, type DayForecast } from "./lib/weather";

/**
 * The layover panel: how long she is actually free, and a button that packs the roster context
 * into text for whichever assistant she already uses.
 *
 * Why a clipboard button and not four API integrations: weather, attractions, local transport
 * and what's on each carry their own licence, coverage gap and running cost, and between them
 * they cover the EK network badly — events data thins out across exactly the Middle East and
 * South Asia she flies to most. An assistant answers all four anywhere. The one thing it cannot
 * know is the roster, which is the one thing this app has.
 *
 * The free-time line is shown, not just copied: it exists nowhere else in the app. The timeline
 * card only knows layovers *within* one trip, and a real down-route rest sits between two.
 */
export function CopyLayoverBrief({ rest }: { rest: LayoverRest }) {
  const airport = useAirport(rest.station);
  const [hotel, setHotel] = useState("");
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

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

  const [forecast, setForecast] = useState<DayForecast[] | null>(null);
  const lat = airport?.lat;
  const lng = airport?.lng;

  useEffect(() => {
    setForecast(null);
    if (lat == null || lng == null) return;
    let cancelled = false;
    void fetchLayoverForecast(lat, lng, rest.arrTz, layoverDates(rest)).then((days) => {
      if (!cancelled) setForecast(days);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, rest]);

  async function copy() {
    const text = formatLayoverBrief(rest, { city: airport?.city, hotel, forecast });
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

  return (
    <section
      data-testid="layover-brief"
      className="hairline mt-3 flex flex-col gap-3 rounded-lg border border-edge bg-raised p-4"
    >
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-muted">
          Layover · {airport?.city ?? rest.station}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Free until report{" "}
          <span data-testid="layover-free" className="num text-base font-semibold text-ink">
            {formatDuration(rest.arrUtc, rest.nextReportUtc)}
          </span>
        </p>
      </div>

      {forecast ? (
        <div data-testid="layover-weather" className="flex flex-col gap-1">
          {forecast.map((day) => (
            <p key={day.date} className="flex items-baseline gap-2 text-sm">
              <span className="num w-14 shrink-0 text-ink-muted">{day.date.slice(5)}</span>
              <span className="num shrink-0 text-ink">
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
          <p className="text-xs text-ink-muted">
            Forecast ·{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">
              Open-Meteo
            </a>
          </p>
        </div>
      ) : lat != null && lng != null ? (
        // Not a failure and not worth hiding: forecasts only run about two weeks out, and a
        // roster is published a month ahead, so this is the normal state for most layovers.
        // Saying so beats a silent gap — and beats a seasonal average dressed as a forecast.
        <p data-testid="layover-weather-pending" className="text-sm text-ink-muted">
          No forecast yet — usually available about two weeks ahead.
        </p>
      ) : null}

      {/* Pointers, not a second copy of the data. A city guide and a what's-on search are
          two links; mirroring them into this app would mean a licence, a coverage gap and a
          table that goes stale — and the assistant already answers both from the brief. */}
      {airport?.city && (
        <p data-testid="layover-lookup" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a
            className="text-accent underline"
            href={`https://en.wikivoyage.org/w/index.php?search=${encodeURIComponent(airport.city)}`}
            target="_blank"
            rel="noreferrer"
          >
            City guide
          </a>
          <a
            className="text-accent underline"
            href={`https://www.google.com/search?q=${encodeURIComponent(`events in ${airport.city} this week`)}`}
            target="_blank"
            rel="noreferrer"
          >
            What's on
          </a>
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Hotel (optional — sharpens the answer)</span>
        {/* No `text-sm` here on purpose: it would beat the 16px floor in tokens.css and iOS
            would zoom the whole layout on focus. */}
        <input
          data-testid="layover-hotel"
          type="text"
          value={hotel}
          onChange={(e) => setHotel(e.target.value)}
          placeholder="e.g. Rydges Sydney Central"
          className="min-h-[44px] rounded-md border border-edge bg-card px-3 text-ink placeholder:text-ink-muted"
        />
      </label>

      <button
        type="button"
        data-testid="copy-layover-brief"
        onClick={copy}
        className="flex min-h-[44px] items-center justify-center rounded-md bg-accent px-4 font-semibold text-card transition-opacity duration-[120ms] hover:opacity-90"
      >
        {copied ? "Copied" : "Copy layover brief"}
      </button>
      <p className="text-center text-xs text-ink-muted">
        Paste into ChatGPT, Gemini or Claude
      </p>

      {fallbackText && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">Copy failed — select and copy this:</span>
          <textarea
            data-testid="layover-brief-fallback"
            readOnly
            rows={8}
            value={fallbackText}
            className="w-full rounded-md border border-edge bg-card p-2 text-ink"
          />
        </label>
      )}
    </section>
  );
}
