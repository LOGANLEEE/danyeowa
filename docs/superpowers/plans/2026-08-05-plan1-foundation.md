# Plan 1: Foundation (Repo Wipe + Cloudflare Scaffold) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wipe the old Expo app and stand up the new monorepo: Vite React SPA served by a single Cloudflare Worker with a Hono `/api`, D1 bound and verified, tests green, CI wired, deployed once.

**Architecture:** Single Worker serves built SPA via static assets binding and handles `/api/*` with Hono (`run_worker_first` for API routes, SPA fallback for everything else). D1 bound but schema-less for now — Drizzle and real tables arrive in Plan 2 (auth). `shared/` workspace proves web↔worker type sharing with one real type.

**Tech Stack:** pnpm workspaces, TypeScript, Vite + React + TanStack Router, Tailwind CSS v4, Hono, wrangler v4, D1, Vitest + @cloudflare/vitest-pool-workers.

**Spec:** `docs/superpowers/specs/2026-08-05-pwa-rework-design.md`

## Global Constraints

- Branch: all work on `rework/pwa` (already created). Never commit to `main`.
- Node ≥ 22, pnpm ≥ 9 (`corepack enable`).
- Package manager: pnpm workspaces — root is private, workspaces `web`, `worker`, `shared`.
- One Worker only; no Cloudflare Pages, no separate API worker.
- App name stays `roaster-me` everywhere (rebrand deferred per spec).
- Keep in repo: `.git`, `docs/`, `EK_timetable.pdf` (moves to `scripts/fixtures/EK_timetable_dec2007.pdf` — test fixture per spec), `.github/` replaced by new CI.
- Executor MUST verify wrangler config keys against current Cloudflare docs (cloudflare skill / context7) before Task 3 — key names below are believed-current for wrangler v4 but docs win.

---

### Task 1: Wipe old app + fix .gitignore

Old Expo/Supabase app is fully removed (history stays in git). Root `.gitignore` currently contains a bare `*` (written by a python venv created at repo root) — every new file is silently ignored. Replace it.

**Files:**
- Delete: all tracked files/dirs EXCEPT `.git/`, `docs/`, `EK_timetable.pdf`, `.gitattributes`
- Move: `EK_timetable.pdf` → `scripts/fixtures/EK_timetable_dec2007.pdf`
- Create: `.gitignore` (new), `README.md` (stub)
- Delete untracked local junk: `.env`, `node_modules/`, `.yarn/`, `.expo/`, `pyvenv.cfg`, `include/`, `bin/`, `path/`, `python/` (venv artifacts)

**Interfaces:**
- Produces: clean repo root for Task 2 scaffold.

- [ ] **Step 1: Confirm on branch `rework/pwa`**

Run: `git branch --show-current`
Expected: `rework/pwa`

- [ ] **Step 2: Move the PDF fixture, then remove old app**

```bash
mkdir -p scripts/fixtures
git mv EK_timetable.pdf scripts/fixtures/EK_timetable_dec2007.pdf
# remove everything tracked except keepers
git ls-files | grep -vE '^(docs/|scripts/fixtures/|\.gitattributes)' | xargs git rm -q
```

- [ ] **Step 3: Delete untracked venv/tooling junk (repo root only, verify each exists first)**

```bash
cd /Users/loganlee/project/portfolio/roaster-me
rm -rf node_modules .yarn .expo .cursor pyvenv.cfg include bin path python .env yarn.lock
```

- [ ] **Step 4: Write new `.gitignore`**

```gitignore
node_modules/
dist/
.wrangler/
.dev.vars
.env
*.local
.DS_Store
coverage/
```

- [ ] **Step 5: Write stub `README.md`**

```markdown
# Roaster Me

Cabin crew roster sharing. PWA (Vite + React) served by a Cloudflare Worker (Hono + D1).

Rework in progress — see `docs/superpowers/specs/2026-08-05-pwa-rework-design.md`.

## Dev

corepack enable && pnpm install
pnpm dev        # vite + wrangler dev
pnpm test       # all workspace tests
pnpm run deploy # build web + wrangler deploy
```

- [ ] **Step 6: Verify nothing untracked-but-wanted is ignored**

Run: `git check-ignore -v README.md .gitignore; echo exit=$?`
Expected: no output rules matched, `exit=1` (not ignored)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore!: remove Expo app, keep spec + timetable fixture, fix broken .gitignore"
```

---

### Task 2: Monorepo scaffold (pnpm workspaces + shared package)

**Files:**
- Create: `package.json` (root), `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`

**Interfaces:**
- Produces: `@roaster/shared` exporting `type HealthResponse = { ok: boolean; d1: boolean }` — consumed by worker (Task 3) and web (Task 4).

- [ ] **Step 1: Root `package.json`**

```json
{
  "name": "roaster-me",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "pnpm --filter @roaster/web build && wrangler dev",
    "build": "pnpm --filter @roaster/web build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "deploy": "pnpm --filter @roaster/web build && wrangler deploy"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: `pnpm-workspace.yaml`**

```yaml
packages:
  - web
  - worker
  - shared
```

- [ ] **Step 3: `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: `shared/` package**

`shared/package.json`:
```json
{
  "name": "@roaster/shared",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "echo no tests" }
}
```

`shared/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```

`shared/src/index.ts`:
```typescript
export type HealthResponse = { ok: boolean; d1: boolean };
```

- [ ] **Step 5: Install + typecheck**

Run: `corepack enable && pnpm install && pnpm --filter @roaster/shared typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace with shared package"
```

---

### Task 3: Worker — Hono API + D1 binding + tests

**Files:**
- Create: `wrangler.jsonc` (repo root), `worker/package.json`, `worker/tsconfig.json`, `worker/src/index.ts`, `worker/vitest.config.ts`, `worker/test/health.test.ts`

**Interfaces:**
- Consumes: `HealthResponse` from `@roaster/shared`.
- Produces: `GET /api/health` → `200 {"ok":true,"d1":true}`; default export Hono app; `Env` type `{ DB: D1Database; ASSETS: Fetcher }`. Web (Task 4) fetches `/api/health`. Plan 2 adds routes to this same Hono app.

- [ ] **Step 1: Create D1 database (one-time, needs `wrangler login` done)**

Run: `pnpm exec wrangler d1 create roaster-me-db`
Expected: output contains `database_id`. Copy the id into Step 2's config.

- [ ] **Step 2: `wrangler.jsonc` (verify key names against current CF docs first — Global Constraints)**

```jsonc
{
  "name": "roaster-me",
  "main": "worker/src/index.ts",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "roaster-me-db",
      "database_id": "<id from Step 1>"
    }
  ],
  "observability": { "enabled": true }
}
```

- [ ] **Step 3: `worker/package.json` + tsconfig**

```json
{
  "name": "@roaster/worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@roaster/shared": "workspace:*"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.8.0",
    "@cloudflare/workers-types": "^4.0.0",
    "vitest": "^3.0.0"
  }
}
```

`worker/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["@cloudflare/workers-types"] },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Write the failing test first**

`worker/vitest.config.ts`:
```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: { wrangler: { configPath: "../wrangler.jsonc" } },
    },
  },
});
```

`worker/test/health.test.ts`:
```typescript
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { HealthResponse } from "@roaster/shared";

describe("GET /api/health", () => {
  it("returns ok with live D1", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body).toEqual({ ok: true, d1: true });
  });

  it("has a DB binding", () => {
    expect(env.DB).toBeDefined();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm install && pnpm --filter @roaster/worker test`
Expected: FAIL (no worker entry / 404)

- [ ] **Step 6: Minimal implementation**

`worker/src/index.ts`:
```typescript
import { Hono } from "hono";
import type { HealthResponse } from "@roaster/shared";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS one").first<{ one: number }>();
  const body: HealthResponse = { ok: true, d1: row?.one === 1 };
  return c.json(body);
});

export default app;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @roaster/worker test`
Expected: 2 passed

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(worker): hono app with /api/health backed by D1"
```

---

### Task 4: Web — Vite React SPA calling the API

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/App.test.tsx`, `web/src/styles.css`, `web/vitest.config.ts`, `web/src/test-setup.ts`

**Interfaces:**
- Consumes: `GET /api/health` (Task 3), `HealthResponse` from `@roaster/shared`.
- Produces: `web/dist/` consumed by assets binding. `App` renders "Roaster Me" heading + API status. TanStack Router/Query arrive in Plan 3 when there are ≥2 screens — YAGNI here.

- [ ] **Step 1: `web/package.json`**

```json
{
  "name": "@roaster/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@roaster/shared": "workspace:*"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

`web/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src"]
}
```

- [ ] **Step 2: Vite config + entry files**

`web/vite.config.ts`:
```typescript
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:8787" } },
});
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Roaster Me</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/styles.css`:
```css
@import "tailwindcss";
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Write the failing test**

`web/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});
```

`web/src/test-setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest";
```

`web/src/App.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App", () => {
  it("shows title and API status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, d1: true }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    render(<App />);
    expect(screen.getByRole("heading", { name: /roaster me/i })).toBeInTheDocument();
    expect(await screen.findByText(/api: online/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm install && pnpm --filter @roaster/web test`
Expected: FAIL ("Cannot find module './App'" or similar)

- [ ] **Step 5: Minimal `App.tsx`**

```tsx
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
```

- [ ] **Step 6: Run tests + build**

Run: `pnpm --filter @roaster/web test && pnpm --filter @roaster/web build`
Expected: test PASS, `web/dist/index.html` exists

- [ ] **Step 7: End-to-end local check**

Run: `pnpm dev` (root — builds web, starts `wrangler dev`), then `curl -s http://localhost:8787/api/health`
Expected: `{"ok":true,"d1":true}`; opening `http://localhost:8787` shows "Roaster Me" + "API: online". Ctrl-C after.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): vite react spa served by worker assets, health status wired"
```

---

### Task 5: CI + first deploy

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root scripts `typecheck`, `test`, `deploy` (Tasks 2–4).
- Produces: PR gate + main-branch deploy. Requires repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (user adds in GitHub settings — flag as manual step, don't block local verification).

- [ ] **Step 1: Write workflow**

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm --filter @roaster/web build
      - run: pnpm test

  deploy:
    needs: check
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- [ ] **Step 2: Full local gate**

Run: `pnpm typecheck && pnpm test && pnpm --filter @roaster/web build`
Expected: all exit 0

- [ ] **Step 3: First manual deploy**

Run: `pnpm run deploy`
Expected: wrangler prints `https://roaster-me.<subdomain>.workers.dev`
Then: `curl -s https://roaster-me.<subdomain>.workers.dev/api/health` → `{"ok":true,"d1":true}` (remote D1 — empty DB is fine, query is `SELECT 1`)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck + test on PR, deploy on main"
```

- [ ] **Step 5: Manual follow-up for user (note in PR description)**

Add GitHub repo secrets `CLOUDFLARE_API_TOKEN` (Workers deploy permission) + `CLOUDFLARE_ACCOUNT_ID` before merging to main.
