import { useCallback, useEffect, useState } from "react";
import type { HealthResponse, Me } from "@roaster/shared";
import type { TripWithFlights } from "./api";
import { authClient } from "./auth-client";
import CalendarHome from "./CalendarHome";
import Landing from "./Landing";
import Login from "./Login";
import SettingsView from "./SettingsView";
import ShareView from "./ShareView";
import TabBar from "./TabBar";
import type { TabName } from "./TabBar";
import TripDetail from "./TripDetail";
import TripForm from "./TripForm";
import TripsView from "./TripsView";

type SignedOutView = "landing" | "login";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [me, setMe] = useState<Me | null | "loading">("loading");
  const [signedOutView, setSignedOutView] = useState<SignedOutView>("landing");
  const [activeTab, setActiveTab] = useState<TabName>("calendar");
  const [showTripForm, setShowTripForm] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<TripWithFlights | null>(null);
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
    setSignedOutView("landing");
  }

  // The Landing view renders its own hero h1 ("roaster·me") as the page heading, and has
  // no sign-out control to show — skip rendering the header band entirely there so it
  // doesn't leave an empty, bordered strip above the hero (a11y bonus: no duplicate h1s).
  const isLanding = me === null && signedOutView === "landing";
  const isSignedIn = me !== "loading" && me !== null;

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
        {me === "loading" ? (
          <p className="text-ink-muted">loading…</p>
        ) : me === null ? (
          signedOutView === "landing" ? (
            <Landing onSignIn={() => setSignedOutView("login")} />
          ) : (
            <Login onSignedIn={loadMe} onBack={() => setSignedOutView("landing")} />
          )
        ) : showTripForm ? (
          <TripForm
            now={now}
            homeTz={Intl.DateTimeFormat().resolvedOptions().timeZone}
            onSubmitted={() => {
              setShowTripForm(false);
              setTripsVersion((v) => v + 1);
            }}
          />
        ) : selectedTrip ? (
          <TripDetail
            trip={selectedTrip}
            onBack={() => setSelectedTrip(null)}
            onDone={() => {
              setSelectedTrip(null);
              setTripsVersion((v) => v + 1);
            }}
          />
        ) : activeTab === "share" ? (
          <ShareView />
        ) : activeTab === "settings" ? (
          <SettingsView email={me.email} onSignOut={handleSignOut} />
        ) : activeTab === "trips" ? (
          <TripsView
            key={tripsVersion}
            onAddTrip={() => setShowTripForm(true)}
            onOpenTrip={setSelectedTrip}
            now={now}
          />
        ) : (
          // Calendar tab: month grid + next-duty card. Day taps and the next-duty card open
          // the DaySheet directly (CalendarHome owns it) to view/edit/delete an existing trip
          // or add one on an empty day.
          <CalendarHome key={tripsVersion} now={now} openTodayToken={openTodayToken} />
        )}
      </main>

      {isSignedIn && (
        <TabBar
          active={activeTab}
          onSelect={(tab) => {
            setShowTripForm(false);
            setSelectedTrip(null);
            setActiveTab(tab);
          }}
          // Opens the day sheet for today (or the next trip-free day) on the calendar tab,
          // regardless of which tab was active when + was tapped.
          onAdd={() => {
            setShowTripForm(false);
            setSelectedTrip(null);
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
