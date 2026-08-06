export type TabName = "calendar" | "trips" | "share" | "settings";

type Props = {
  active: TabName;
  onSelect: (tab: TabName) => void;
  onAdd: () => void;
};

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CalendarIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

function SuitcaseIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M17 8a3 3 0 1 0 0-6M22 20c0-2.6-2-4.8-4.7-5.6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.65a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.4.24.62.34.87" />
    </svg>
  );
}

/** Fixed bottom tab bar for the signed-in app shell: Calendar · Trips · center Add · Share ·
 * Settings. Hidden entirely when signed out (App.tsx doesn't render it in that state). */
export default function TabBar({ active, onSelect, onAdd }: Props) {
  function tabClass(tab: TabName) {
    return `flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors duration-[120ms] ${
      active === tab ? "text-accent" : "text-ink-muted"
    }`;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-edge bg-card px-2 pt-2"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <button type="button" data-testid="tab-calendar" onClick={() => onSelect("calendar")} className={tabClass("calendar")}>
        <CalendarIcon />
        Calendar
      </button>
      <button type="button" data-testid="tab-trips" onClick={() => onSelect("trips")} className={tabClass("trips")}>
        <SuitcaseIcon />
        Trips
      </button>
      <button
        type="button"
        data-testid="tab-add"
        onClick={onAdd}
        aria-label="Add"
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-ground shadow-sm transition-transform duration-[120ms] active:scale-[0.96]"
      >
        <PlusIcon />
      </button>
      <button type="button" data-testid="tab-share" onClick={() => onSelect("share")} className={tabClass("share")}>
        <PeopleIcon />
        Share
      </button>
      <button type="button" data-testid="tab-settings" onClick={() => onSelect("settings")} className={tabClass("settings")}>
        <GearIcon />
        Settings
      </button>
    </nav>
  );
}
