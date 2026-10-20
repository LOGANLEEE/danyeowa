import { useEffect, useState } from "react";
import type { UsageResponse, UsageUserSummary } from "@danyeowa/shared";

/** Owner-only: how adding a roster actually goes for the people using the app. The API 404s for
 * anyone not on USAGE_VIEWER_EMAILS, which is the gate — this page only renders what it gets. */

const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`);

function Row({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-edge last:border-b-0">
      <dt className="text-ink-muted">{label}</dt>
      {/* The value never wraps ("1 / 0 /" then "0" read as two numbers); the label does. */}
      <dd data-testid={testId} className="num shrink-0 whitespace-nowrap text-ink">
        {value}
      </dd>
    </div>
  );
}

function UserUsage({ u }: { u: UsageUserSummary }) {
  const f = u.funnel;
  return (
    <section
      data-testid="usage-user"
      className="flex flex-col gap-4 rounded-lg border border-edge bg-card p-4"
    >
      <h2 className="break-all font-semibold text-ink">{u.email}</h2>
      <dl className="flex flex-col">
        <Row label="Sessions" value={u.sessions} />
        <Row label="Opened as app / in browser" value={`${u.appOpened.standalone} / ${u.appOpened.browser}`} />
        <Row label="Add form opened" value={f.addFormOpened} testId="usage-add_form_opened" />
        <Row
          label="Lookup found / unknown / error"
          value={`${f.flightLookup.found} / ${f.flightLookup.unknown} / ${f.flightLookup.error}`}
        />
        <Row label="Switched to manual" value={f.manualEntryOpened} />
        <Row
          label="Trips saved"
          value={f.tripSaved.autofill + f.tripSaved.manual}
          testId="usage-trip_saved"
        />
        <Row label="…by autofill / manual" value={`${f.tripSaved.autofill} / ${f.tripSaved.manual}`} />
        <Row label="Save failed" value={f.tripSaveFailed} />
        <Row label="Median open → saved" value={seconds(u.medianMsToSave)} testId="usage-median" />
        {Object.entries(u.tabViewed).map(([tab, n]) => (
          <Row key={tab} label={`Tab: ${tab}`} value={n} />
        ))}
      </dl>
      <h3 className="text-xs uppercase text-ink-muted">Recent</h3>
      <ol className="flex flex-col gap-1 text-sm">
        {u.recent.map((e, i) => (
          <li key={i} className="flex flex-wrap gap-x-2 text-ink">
            <span className="num text-ink-muted">
              {new Date(e.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
            </span>
            <span>{e.name}</span>
            <span className="num break-all text-ink-muted">{JSON.stringify(e.props)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageResponse | null | "error">(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/usage?days=${days}`)
      .then(async (r): Promise<UsageResponse | "error"> =>
        r.ok ? ((await r.json()) as UsageResponse) : "error",
      )
      .then(setData)
      .catch(() => setData("error"));
  }, [days]);

  return (
    <div data-testid="usage-page" className="flex w-full max-w-xl flex-col gap-4">
      <a href="/" className="flex min-h-11 items-center text-accent">
        ← Back
      </a>
      <label className="flex min-h-11 items-center justify-between gap-2 text-ink">
        Window
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="min-h-11 rounded border border-edge bg-raised px-3 text-base text-ink"
        >
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </label>
      {data === null ? (
        <p className="text-ink-muted">Loading…</p>
      ) : data === "error" ? (
        <p className="text-ink-muted">Not available.</p>
      ) : data.users.length === 0 ? (
        <p className="text-ink-muted">No events in the last {data.days} days.</p>
      ) : (
        data.users.map((u) => <UserUsage key={u.email} u={u} />)
      )}
    </div>
  );
}
