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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">Roaster Me</h1>
      {me === "loading" ? (
        <p>loading…</p>
      ) : me === null ? (
        <Login onSignedIn={loadMe} />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p>Signed in as {me.email}</p>
          <button type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      )}
      <p className="text-xs text-gray-500">
        {health === null ? "checking…" : health.ok ? "API: online" : "API: offline"}
      </p>
    </main>
  );
}
