/** Placeholder for the family-sharing feature. Read-only for now — no invite flow exists yet. */
export default function ShareView() {
  return (
    <div className="entrance flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 text-center">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-ink-muted"
      >
        <circle cx="9" cy="8" r="3" />
        <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M17 8a3 3 0 1 0 0-6M22 20c0-2.6-2-4.8-4.7-5.6" />
      </svg>
      <p className="text-lg font-semibold text-ink">Invite family</p>
      <p className="text-sm text-ink-muted">They'll see when you're home — coming soon</p>
    </div>
  );
}
