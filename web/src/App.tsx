import { useEffect, useState } from "react";
import type { HealthResponse } from "@roaster/shared";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setHealth({ ok: false, d1: false }));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">Roaster Me</h1>
      <p>{health === null ? "checking…" : health.ok ? "API: online" : "API: offline"}</p>
    </main>
  );
}
