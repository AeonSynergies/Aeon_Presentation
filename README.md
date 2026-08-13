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
server) and a standard Postgres database — no Docker required, though Railway can build
either with Nixpacks directly from this repo.

1. Create a Railway project, add a **PostgreSQL** plugin, and copy its connection string.
2. Deploy `apps/api` as a service: root directory `apps/api`, build command
   `pnpm install --frozen-lockfile && pnpm --filter @aeon/database generate && pnpm --filter @aeon/api build`,
   start command `pnpm --filter @aeon/api start`. Set env vars `DATABASE_URL` (from the
   Postgres plugin), `JWT_ACCESS_SECRET` (random string), `WEB_ORIGIN` (the web service's
   public URL), `NODE_ENV=production`.
3. Run the migration + seed once against the Railway Postgres (e.g. via
   `pnpm --filter @aeon/database migrate` then `pnpm --filter @aeon/database seed`, with
   `DATABASE_URL` pointed at Railway).
4. Deploy `apps/web` as a second service: root directory `apps/web`, build command
   `pnpm install --frozen-lockfile && pnpm --filter @aeon/web build`, start command
   `pnpm --filter @aeon/web start`. Set `VITE_API_URL` to the API service's public URL
   **before the build runs** (Railway build-time env vars), and `NODE_ENV=production`.
5. Point your domain (via Cloudflare DNS) at the web service's Railway URL.
