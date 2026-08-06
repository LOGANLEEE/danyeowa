type Props = { onSignIn: () => void };

export default function Landing({ onSignIn }: Props) {
  return (
    <div className="entrance flex w-full max-w-md flex-col items-center gap-8 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold text-ink">
          roaster<span className="text-accent">·me</span>
        </h1>
        <p className="text-lg font-semibold text-ink">
          Your flight roster, shared with the people waiting for you
        </p>
        <p className="text-sm text-ink-muted">
          Cabin-crew roster app: enter trips fast, report-time-first, family follows along.
        </p>
      </div>

      {/* Mock next-duty card — static sample, mirrors CrewHome's next duty card */}
      <div className="hairline flex w-full flex-col gap-3 rounded-lg border border-edge bg-card p-4 text-left">
        <div>
          <p className="text-lg font-semibold text-ink">DXB → AKL</p>
          <p className="text-sm text-ink-muted">EK448</p>
        </div>

        <div className="hairline rounded border border-edge bg-raised p-3">
          <p className="text-xs uppercase text-ink-muted">Report</p>
          <p className="num text-3xl font-semibold text-report">08:45</p>
          <p className="text-sm text-ink-muted">
            leave home by <span className="num">07:50</span>
          </p>
        </div>

        <p className="num text-sm text-ink-muted">
          dep 10:45 → arr 06:20<sup>+1</sup>
        </p>
      </div>

      <ul className="flex w-full flex-col gap-3 text-left text-sm">
        <li className="flex gap-2">
          <span className="text-ink-muted" aria-hidden="true">
            •
          </span>
          <span className="text-ink">Report-time-first schedule — built for crew, not passengers</span>
        </li>
        <li className="flex gap-2">
          <span className="text-ink-muted" aria-hidden="true">
            •
          </span>
          <span className="text-ink">One-tap trip entry with airport autofill</span>
        </li>
        <li className="flex gap-2">
          <span className="text-ink-muted" aria-hidden="true">
            •
          </span>
          <span className="text-ink">
            Share with family — they see when you're home{" "}
            <span className="rounded border border-edge px-1.5 py-0.5 text-xs text-ink-muted">
              coming soon
            </span>
          </span>
        </li>
      </ul>

      <button
        type="button"
        onClick={onSignIn}
        className="w-full rounded bg-accent px-3 py-3 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
      >
        Sign in
      </button>
    </div>
  );
}
