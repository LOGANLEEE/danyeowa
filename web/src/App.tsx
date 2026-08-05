import { useCallback, useEffect, useState } from "react";
import type { HealthResponse, Me } from "@roaster/shared";
import { authClient } from "./auth-client";
import CrewHome from "./CrewHome";
import Landing from "./Landing";
import Login from "./Login";
import TripForm from "./TripForm";

type SignedOutView = "landing" | "login";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [me, setMe] = useState<Me | null | "loading">("loading");
  const [signedOutView, setSignedOutView] = useState<SignedOutView>("landing");
  const [showTripForm, setShowTripForm] = useState(false);
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
  }

  // The Landing view renders its own hero h1 ("roaster·me") as the page heading.
  // Suppress the header's h1 there so the page has exactly one h1 (a11y: no duplicate headings).
  const isLanding = me === null && signedOutView === "landing";

  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        {isLanding ? (
          <span className="text-xl font-semibold text-ink-bright" aria-hidden="true">
            roaster<span className="text-amber">·me</span>
          </span>
        ) : (
          <h1 className="text-xl font-semibold text-ink-bright">
            roaster<span className="text-amber">·me</span>
          </h1>
        )}
        {me !== "loading" && me !== null && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-ink-muted">{me.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded border border-edge px-2 py-1 text-ink hover:border-ink-muted"
            >
              Sign out
            </button>
          </div>
        )}
      </header>

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
            onSubmitted={() => {
              setShowTripForm(false);
              setTripsVersion((v) => v + 1);
            }}
          />
        ) : (
          <CrewHome key={tripsVersion} onAddTrip={() => setShowTripForm(true)} now={now} />
        )}
      </main>

      <footer className="px-4 py-2 text-right text-xs text-ink-muted">
        {health === null ? "checking…" : health.ok ? "API: online" : "API: offline"}
      </footer>
    </div>
  );
}
