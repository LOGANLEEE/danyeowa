# Roaster Me

Cabin crew roster sharing. PWA (Vite + React) served by a Cloudflare Worker (Hono + D1).

Rework in progress — see `docs/superpowers/specs/2026-08-05-pwa-rework-design.md`.

## Dev

corepack enable && pnpm install
pnpm dev        # vite + wrangler dev
pnpm test       # all workspace tests
pnpm run deploy # build web + wrangler deploy
