# Aeon Presentation Platform

A multi-industry presentation platform used to pitch prospective clients, capture
discovery-call answers live during meetings, price services dynamically based on those
answers, and follow up afterward.

This repository is being rebuilt from a single-file HTML prototype
(`Presentation_Platform.html`) into a real, hosted, multi-user application. See
`CLAUDE.md` for the full project brief and `Aeon_Platform_Requirements_Spec.md` for the
target feature set across all phases.

**Current phase: Phase 1** — one deck (Amazon DSP) rendering correctly with real pricing
math and Discovery Notes behavior, behind real login, backed by a real database.

## Monorepo layout

```
apps/
  web/              TanStack Start frontend (React 19, Tailwind v4)
  api/              Express + tRPC backend
packages/
  database/         Prisma schema + migrations + seed data
  types/            Shared types + the ported pricing/discovery-notes engine
```

## Prerequisites

- Node.js 20+
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- A local PostgreSQL instance

## Setup

```bash
pnpm install

# Copy env files and fill in real values
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env

# Point DATABASE_URL (in both apps/api/.env and packages/database/.env) at your Postgres,
# then set a real JWT_ACCESS_SECRET in apps/api/.env.

pnpm --filter @aeon/database generate
pnpm --filter @aeon/database migrate:dev   # creates the schema
pnpm --filter @aeon/database seed          # seeds the Amazon DSP deck + a demo user
```

The seed script creates a login at `demo@aeonsynergies.com` / `AeonDemo123!` (override via
`SEED_DEMO_USER_EMAIL` / `SEED_DEMO_USER_PASSWORD` in `packages/database/.env`).

## Running locally

```bash
pnpm --filter @aeon/api dev     # http://localhost:4000
pnpm --filter @aeon/web dev     # http://localhost:3000
```

Visit `http://localhost:3000`, sign in, and open the Amazon DSP deck.

## Building for production

```bash
pnpm --filter @aeon/api build && pnpm --filter @aeon/api start
pnpm --filter @aeon/web build && pnpm --filter @aeon/web start
```

The web app's production build reads `VITE_API_URL` at **build time** — set it to the
deployed API's origin before running `pnpm build` for a production deploy.

## Deployment (Railway)

Both apps are plain Node servers (`apps/api`: Express; `apps/web`: a Nitro-built Node
server) and a standard Postgres database — no Docker required; Railway builds each with
Nixpacks directly from this repo. Set **Root Directory to the repo root** (not
`apps/api`/`apps/web`) for both services, so `pnpm install` and `pnpm --filter` resolve
the workspace correctly.

1. Create a Railway project and add a **PostgreSQL** plugin — it provisions
   `DATABASE_URL` automatically as a referenceable variable.
2. Add a service for **apps/api**, connected to this GitHub repo/branch:
   - Root directory: `/` (repo root)
   - Build command: `pnpm install --frozen-lockfile && pnpm --filter @aeon/api build`
     (the root `postinstall` script builds `@aeon/types`, generates the Prisma client,
     and builds `@aeon/database` — all as part of `pnpm install`, so every workspace
     package's compiled output is up to date before either service's own build runs)
   - Start command: `pnpm --filter @aeon/api start:with-migrate` (runs `prisma migrate
     deploy` + the idempotent seed before starting the server — safe to run on every
     deploy, so migrations never need a separate manual step)
   - Variables: `DATABASE_URL` = reference the Postgres plugin's variable,
     `JWT_ACCESS_SECRET` = a long random string, `NODE_ENV` = `production`,
     `WEB_ORIGIN` = the web service's public URL (fill in after step 3 creates it —
     Railway lets you generate the domain first and paste it back here)
   - Generate a public domain for this service (Settings → Networking → Generate
     Domain) and note it down — that's the value for `VITE_API_URL` below.
3. Add a second service for **apps/web**, same repo/branch:
   - Root directory: `/` (repo root)
   - Build command: `pnpm install --frozen-lockfile && pnpm --filter @aeon/web build`
   - Start command: `pnpm --filter @aeon/web start`
   - Variables: `VITE_API_URL` = the apps/api service's public URL from step 2 (must be
     set **before** the build runs — it's baked in at build time), `NODE_ENV` =
     `production`
   - Generate a public domain for this service too (Settings → Networking → Generate
     Domain) — that's the hosted URL.
4. Go back to the **apps/api** service's variables and set `WEB_ORIGIN` to the web
   service's public URL from step 3, then redeploy apps/api so CORS/cookies allow it.
5. Visit the web service's URL, confirm it redirects to `/login` when logged out, sign
   in with the seeded demo user, and click through the Amazon DSP deck.
6. Optional: point a custom domain at the web service via Cloudflare DNS (CNAME to the
   Railway-provided domain), once you're ready to move off the `*.up.railway.app` URL.
