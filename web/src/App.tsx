import { useCallback, useEffect, useState } from "react";
import type { HealthResponse, Me } from "@roaster/shared";
import type { TripWithFlights } from "./api";
import { authClient } from "./auth-client";
import CrewHome from "./CrewHome";
import Landing from "./Landing";
import Login from "./Login";
import SettingsView from "./SettingsView";
import ShareView from "./ShareView";
import TabBar from "./TabBar";
import type { TabName } from "./TabBar";
import TripDetail from "./TripDetail";
import TripForm from "./TripForm";

type SignedOutView = "landing" | "login";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [me, setMe] = useState<Me | null | "loading">("loading");
  const [signedOutView, setSignedOutView] = useState<SignedOutView>("landing");
  const [activeTab, setActiveTab] = useState<TabName>("calendar");
  const [showTripForm, setShowTripForm] = useState(false);
  const [tripFormInitialDate, setTripFormInitialDate] = useState<string | undefined>(undefined);
  const [selectedTrip, setSelectedTrip] = useState<TripWithFlights | null>(null);
  const [tripsVersion, setTripsVersion] = useState(0);
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

      <main className="flex flex-1 flex-col items-center px-4 py-6">
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
            initialDate={tripFormInitialDate}
            now={now}
            homeTz={Intl.DateTimeFormat().resolvedOptions().timeZone}
            onSubmitted={() => {
              setShowTripForm(false);
              setTripFormInitialDate(undefined);
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
        ) : (
          // "calendar" and "trips" both render CrewHome unchanged for now — T3 splits its
          // content (calendar+next-duty card vs. upcoming list) between the two tabs.
          <CrewHome
            key={tripsVersion}
            onAddTrip={() => setShowTripForm(true)}
            onOpenTrip={setSelectedTrip}
            onPickDay={(isoDate) => {
              setTripFormInitialDate(isoDate);
              setShowTripForm(true);
            }}
            now={now}
          />
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
          // Plan6 T4 rewires this to open the day sheet for today/next free day; for now it
          // routes into the existing TripForm flow.
          onAdd={() => setShowTripForm(true)}
        />
      )}

      <footer className="px-4 py-2 text-right text-xs text-ink-muted">
        {health === null ? "checking…" : health.ok ? "API: online" : "API: offline"}
      </footer>
    </div>
  );
}
