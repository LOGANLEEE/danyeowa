import { useCallback, useEffect, useState } from "react";
import type { HealthResponse, Me } from "@roaster/shared";
import { authClient } from "./auth-client";
import CalendarHome from "./CalendarHome";
import InstallBanner from "./InstallBanner";
import Landing from "./Landing";
import SettingsView from "./SettingsView";
import ShareView from "./ShareView";
import SharedViewer from "./SharedViewer";
import TabBar from "./TabBar";
import type { TabName } from "./TabBar";
import TripForm from "./TripForm";

const SHARE_PATH_PREFIX = "/share/";

/** Extracts the token from a `/share/:token` path, or `null` when the current path isn't a
 * share link. Public family links must be reachable with zero app/auth chrome, so this check
 * happens before any of App's signed-in/signed-out state or effects come into play.
 *
 * Deliberately does NOT decodeURIComponent: tokens are base64url (RFC 4648 §5, alphabet
 * `[A-Za-z0-9_-]`), which never contains a byte that needs percent-encoding, so decoding
 * would only add risk — a hand-mangled URL like `/share/100%` has a lone `%` that isn't a
 * valid percent-escape and throws a URIError. The raw path slice is passed straight through;
 * an unrecognized/malformed token simply 404s from the API like any other unknown token,
 * which SharedViewer already renders as the friendly inactive card. */
function sharedTokenFromPath(pathname: string): string | null {
  if (!pathname.startsWith(SHARE_PATH_PREFIX)) return null;
  const token = pathname.slice(SHARE_PATH_PREFIX.length);
  return token.length > 0 ? token : null;
}

export default function App() {
  // Checked once at module-eval-adjacent render time (not in an effect) so that a /share/:token
  // load never mounts the rest of App's state or fires its effects (health/me fetches) at all -
  // family members opening a shared link have no account and must see zero auth-related network
  // activity, not just a hidden login form.
  const sharedToken = sharedTokenFromPath(location.pathname);
  if (sharedToken !== null) {
    return <SharedViewer token={sharedToken} />;
  }

  return <SignedInApp />;
}

function SignedInApp() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [me, setMe] = useState<Me | null | "loading">("loading");
  const [activeTab, setActiveTab] = useState<TabName>("calendar");
  const [showTripForm, setShowTripForm] = useState(false);
  const [tripsVersion, setTripsVersion] = useState(0);
  // Bumped to ask CalendarHome to open the day sheet for today (or the next trip-free day) -
  // fired by the tab bar's center + button, from any tab.
  const [openTodayToken, setOpenTodayToken] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setHealth({ ok: false, d1: false }));
  }, []);

  const loadMe = useCallback(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  async function handleSignOut() {
    await authClient.signOut();
    setMe(null);
  }

  // Render nothing until /api/me answers: index.html's boot splash is dismissed by
  // `#root:not(:empty)`, so an empty #root is what holds it on screen. Returning a React
  // loading state here would drop the splash and replace it with a bare "loading…" line.
  if (me === "loading") return null;

  // Landing is the only signed-out screen (sign-in form inline, no separate login view) and
  // renders its own hero h1 ("roaster·me") as the page heading, with no sign-out control to
  // show — skip rendering the header band entirely there so it doesn't leave an empty,
  // bordered strip above the hero (a11y bonus: no duplicate h1s).
  const isLanding = me === null;
  const isSignedIn = me !== null;

  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      {!isLanding && (
        <header className="border-b border-edge px-4 py-2">
          <h1 className="text-lg font-semibold text-ink">
            roaster<span className="text-accent">·me</span>
          </h1>
        </header>
      )}

      <main
        className={`flex flex-1 flex-col items-center px-4 py-6 ${isSignedIn ? "pb-24" : ""}`}
        style={isSignedIn ? { paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" } : undefined}
      >
        {isSignedIn && <InstallBanner />}

        {me === null ? (
          <Landing onSignedIn={loadMe} />
        ) : showTripForm ? (
          <TripForm
            now={now}
            homeTz={Intl.DateTimeFormat().resolvedOptions().timeZone}
            onSubmitted={() => {
              setShowTripForm(false);
              setTripsVersion((v) => v + 1);
            }}
          />
        ) : activeTab === "share" ? (
          <ShareView />
        ) : activeTab === "settings" ? (
          <SettingsView email={me.email} onSignOut={handleSignOut} />
        ) : (
          // The calendar is the roster. A separate Trips tab listed the same duties a second
          // time — one row per leg, which read as a chart of unranked things — and was the only
          // way into a full-screen trip detail. Both are gone; the day card owns view, edit and
          // delete, and the month grid owns the overview.
          <CalendarHome key={tripsVersion} now={now} openTodayToken={openTodayToken} />
        )}
      </main>

      {isSignedIn && (
        <TabBar
          active={activeTab}
          onSelect={(tab) => {
            setShowTripForm(false);
            setActiveTab(tab);
          }}
          // Opens the day sheet for today (or the next trip-free day) on the calendar tab,
          // regardless of which tab was active when + was tapped.
          onAdd={() => {
            setShowTripForm(false);
            setActiveTab("calendar");
            setOpenTodayToken((v) => v + 1);
          }}
        />
      )}

      {/* Hidden signed-in: the fixed TabBar now owns the bottom of the viewport, and this
          API-status footer isn't part of the signed-in mock. Simpler than repositioning it
          above the tab bar for a debug-only readout. */}
      {!isSignedIn && (
        <footer className="px-4 py-2 text-right text-xs text-ink-muted">
          {health === null ? "checking…" : health.ok ? "API: online" : "API: offline"}
        </footer>
      )}
    </div>
  );
}
