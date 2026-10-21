import { useEffect, useState } from "react";
import type { UsageFormTimeline, UsageResponse, UsageUserSummary } from "@danyeowa/shared";

/** Owner-only: how adding a roster actually goes for the people using the app. The API 404s for
 * anyone not on USAGE_VIEWER_EMAILS, which is the gate — this page only renders what it gets. */

function duration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const total = Math.round(ms / 1000);
  return total < 3600
    ? `${Math.floor(total / 60)}m ${total % 60}s`
    : `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
}

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

function Row({
  label,
  value,
  testId,
  rowTestId,
  emphasis = false,
}: {
  label: string;
  value: string | number;
  testId?: string;
  rowTestId?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      data-testid={rowTestId}
      className="flex min-h-11 items-center justify-between gap-4 border-b border-edge last:border-b-0"
    >
      <dt className="text-ink-muted">{label}</dt>
      {/* The value never wraps ("1 / 0 /" then "0" read as two numbers); the label does. */}
      <dd
        data-testid={testId}
        className={`num shrink-0 whitespace-nowrap ${emphasis ? "font-semibold text-report" : "text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Heading({ children }: { children: string }) {
  return <h3 className="text-xs uppercase text-ink-muted">{children}</h3>;
}

const STEP_LABELS: Record<string, string> = {
  opened: "opened (first keystroke)",
  left_hidden: "left: page hidden",
  left_closed: "left: form closed",
  resumed: "back after",
};
const stepLabel = (label: string) => STEP_LABELS[label] ?? label.replaceAll("_", " ");

function FormTimeline({ form }: { form: UsageFormTimeline }) {
  return (
    <div data-testid="usage-form" className="flex flex-col">
      <p className="text-sm text-ink">
        <span className="num">{when(form.openedAt)}</span> · from {form.entry.replaceAll("_", " ")} ·{" "}
        {form.outcome}
      </p>
      <dl className="flex flex-col">
        {form.steps.map((s, i) => (
          <Row
            key={i}
            rowTestId="usage-form-step"
            testId={s.longest ? "usage-form-longest" : undefined}
            emphasis={s.longest}
            label={stepLabel(s.label)}
            // Away time is how long she was gone, not a step she spent on the form.
            value={i === 0 ? "—" : s.label === "resumed" ? duration(s.gapMs) : `+${duration(s.gapMs)}`}
          />
        ))}
      </dl>
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
        <Row label="Median open → saved" value={duration(u.medianMsToSave)} testId="usage-median" />
        <Row
          label="Legs time-edited / autofilled"
          value={`${u.timeEdits.legsEdited} / ${u.timeEdits.legsAutofilled}`}
          testId="usage-time-edits"
        />
        {Object.entries(u.tabViewed).map(([tab, n]) => (
          <Row key={tab} label={`Tab: ${tab}`} value={n} />
        ))}
      </dl>
      {u.missingFlights.length > 0 && (
        <>
          <Heading>Missing flights</Heading>
          <dl className="flex flex-col">
            {u.missingFlights.map((m) => (
              <Row
                key={m.flightNo}
                label={m.flightNo}
                value={`${m.unknown} unknown / ${m.error} error`}
                testId={`usage-missing-${m.flightNo}`}
              />
            ))}
          </dl>
        </>
      )}
      {Object.keys(u.entries).length > 0 && (
        <>
          <Heading>Add form opened from</Heading>
          <dl className="flex flex-col">
            {Object.entries(u.entries).map(([entry, n]) => (
              <Row key={entry} label={entry.replaceAll("_", " ")} value={n} testId={`usage-entry-${entry}`} />
            ))}
          </dl>
        </>
      )}
      {(() => {
        const steps = [...new Set([...Object.keys(u.formLeft.closed), ...Object.keys(u.formLeft.hidden)])];
        return steps.length === 0 ? null : (
          <>
            <Heading>Left the form after — closed / hidden</Heading>
            <dl className="flex flex-col">
              {steps.map((step) => (
                <Row
                  key={step}
                  label={stepLabel(step)}
                  value={`${u.formLeft.closed[step] ?? 0} / ${u.formLeft.hidden[step] ?? 0}`}
                  testId={`usage-left-${step}`}
                />
              ))}
            </dl>
          </>
        );
      })()}
      {u.sittings.length > 0 && (
        <>
          <Heading>Sittings — saved · median gap</Heading>
          <dl className="flex flex-col">
            {u.sittings.map((s) => (
              <Row
                key={s.startedAt}
                label={when(s.startedAt)}
                value={`${s.saved} saved · ${duration(s.medianGapMs)}`}
                testId="usage-sitting"
              />
            ))}
          </dl>
        </>
      )}
      {u.forms.length > 0 && (
        <>
          <Heading>Last forms, step by step</Heading>
          <div className="flex flex-col gap-4">
            {u.forms.map((form) => (
              <FormTimeline key={form.openedAt} form={form} />
            ))}
          </div>
        </>
      )}
      <Heading>Recent</Heading>
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
