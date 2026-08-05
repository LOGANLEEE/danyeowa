import { useCallback, useEffect, useState } from "react";
import type { HealthResponse, Me } from "@roaster/shared";
import { authClient } from "./auth-client";
import Login from "./Login";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [me, setMe] = useState<Me | null | "loading">("loading");

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

  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h1 className="text-xl font-semibold text-ink-bright">
          roaster<span className="text-amber">·me</span>
        </h1>
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

      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        {me === "loading" ? (
          <p className="text-ink-muted">loading…</p>
        ) : me === null ? (
          <Login onSignedIn={loadMe} />
        ) : null}
      </main>

      <footer className="px-4 py-2 text-right text-xs text-ink-muted">
        {health === null ? "checking…" : health.ok ? "API: online" : "API: offline"}
      </footer>
    </div>
  );
}
