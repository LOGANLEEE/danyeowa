import { useEffect, useState } from "react";
import { formatDuration } from "@danyeowa/shared";
import { useAirport } from "./lib/airports";
import { formatLayoverBrief, type LayoverRest } from "./lib/layoverBrief";

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

  async function copy() {
    const text = formatLayoverBrief(rest, { city: airport?.city, hotel });
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
