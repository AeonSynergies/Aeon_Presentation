# Aeon Presentation Platform

A multi-industry presentation platform used to pitch prospective clients, capture
discovery-call answers live during meetings, price services dynamically based on those
answers, and follow up afterward.

This repository is being rebuilt from a single-file HTML prototype
(`Presentation_Platform.html`) into a real, hosted, multi-user application. See
`CLAUDE.md` for the full project brief and `Aeon_Platform_Requirements_Spec.md` for the
target feature set across all phases.

Phases 1, 2a, 2b, and 2c are live and verified: four decks, correct pricing, the Deck
Builder wizard, and the four-role permission matrix (Sales Executive, Operations Manager,
BD Manager, Admin) enforced server-side on every relevant tRPC procedure
(`requirePermission()` in `apps/api/src/trpc.ts`, reading the same `can()` matrix from
`@aeon/types` the frontend uses to decide what to show) — a hidden button was never the
enforcement, and now nothing is. Admins manage accounts at `/team`; Edit Deck, Export
(rate-card CSV), and Send to Client are real, role-gated actions on the deck player.

**Current phase: Phase 3a** — AI-assisted deck drafting. From `/decks/new`, "Draft with
AI" (`apps/web/src/components/builder/DeckWizard.tsx`) sends a short plain-language
description to `ai.draftDeck` (`apps/api/src/routers/ai.ts`, gated by the same
`requirePermission("createDeck")` as manual creation) and loads the result into the exact
same wizard state the manual/clone flows use — **the AI never creates a deck directly**;
`deck.create` (a human clicking Save, after reviewing/editing every field) is the only
path to a persisted deck, same as every other creation path. Price-band fields the draft
populated are marked with a subtle "✦ AI-suggested" badge until a human edits that band.

The Anthropic API key lives server-side only — an SSM SecureString
(`/aeon/ANTHROPIC_API_KEY`, same pattern as `DATABASE_URL`/`JWT_ACCESS_SECRET`) injected
into the api App Runner service as a runtime secret, sourced from an `ANTHROPIC_API_KEY`
repo secret that has to be added by hand (see "Deployment (AWS)" below) — deploys work
fine without it, just with AI drafting correctly disabled rather than broken. Two
guardrails on the drafting endpoint: a prompt length cap (800 characters, enforced by the
tRPC input schema, so an out-of-range prompt is rejected before it ever reaches Anthropic)
and a per-user rate limit (5 requests/hour, checked against a Postgres ledger —
`AiDraftRequest` — *before* calling Anthropic, so a capped user's request never costs a
real API call; the ledger also means the limit holds across server restarts and every App
Runner instance, not an in-memory counter that would reset per instance).

Deployed pushes run three post-deploy live E2E suites (`infra/e2e/`): `wizard-e2e.mjs`
(Phase 2b), `role-enforcement-e2e.mjs` (Phase 2c), and `ai-draft-e2e.mjs` (Phase 3a, run
only when `ANTHROPIC_API_KEY` is configured) — the last one drafts a deck through the real
UI with a real Anthropic call, confirms the deck count is unchanged until an explicit Save,
confirms every network request during drafting stays same-origin (proving the key never
reaches the browser and the browser never talks to Anthropic directly), and confirms a
dedicated QA user genuinely gets rejected once it exceeds the rate limit.

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
pnpm --filter @aeon/database seed          # seeds all three decks + a demo user
```

The seed script creates a login at `demo@aeonsynergies.com` / `AeonDemo123!` (override via
`SEED_DEMO_USER_EMAIL` / `SEED_DEMO_USER_PASSWORD` in `packages/database/.env`).

## Running locally

```bash
pnpm --filter @aeon/api dev     # http://localhost:4000
pnpm --filter @aeon/web dev     # http://localhost:3000
```

Visit `http://localhost:3000`, sign in, and open any of the three decks.

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

## Deployment (AWS)

The active deployment target. Fully automated via `infra/aws/deploy.sh`, run by
`.github/workflows/deploy-aws.yml` on every push to `main` (and manually via
`workflow_dispatch`). Requires `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as repo
secrets, and optionally an `AWS_REGION` repo variable (defaults to `us-east-1`).

Optionally also `ANTHROPIC_API_KEY` as a repo secret, to enable AI-assisted deck drafting
(Phase 3a) — get one from [console.anthropic.com](https://console.anthropic.com). Without
it, deploys still succeed; `ai.draftDeck` just returns a clear "not configured" error
instead of drafting, and the `ai-draft-e2e.mjs` live-e2e step skips itself. Add it any
time — the next push to `main` picks it up and updates the running api service with it
(deploy.sh stores it in SSM and re-checks whether the running service needs the update,
it doesn't require deleting/recreating anything).

Optionally also `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET` as
repo secrets (all three together, or none), to enable "Sign in with Microsoft" (Phase 4a
Part 1). Without them, deploys still succeed; the login page simply doesn't show the
Microsoft button (`auth.config` reports `microsoftEnabled: false`) and
`/api/auth/microsoft/*` redirects to a clean "not configured" error rather than crashing.
To get real values:
1. In the Azure Portal (a plain Azure Free Account works — this doesn't need the
   Microsoft 365 Developer Program sandbox), go to **Azure Active Directory → App
   registrations → New registration**.
2. Name it anything (e.g. "Aeon Presentation Platform"), leave the supported-account-types
   default, and under **Redirect URI** add a **Web** platform entry pointing at the
   deployed api service's own URL + `/api/auth/microsoft/callback` (e.g.
   `https://<api-service>.awsapprunner.com/api/auth/microsoft/callback` — the api
   service's URL is printed by every deploy run, `api: https://...`, and stored in
   `API_ORIGIN` on the running service once Azure is configured).
3. Copy the **Application (client) ID** and **Directory (tenant) ID** from the
   registration's Overview page — these are `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`.
4. Under **Certificates & secrets → Client secrets → New client secret**, create one and
   copy its **Value** immediately (Azure only shows it once) — that's
   `AZURE_CLIENT_SECRET`.
5. No Microsoft Graph API permissions are needed — sign-in only requests the standard
   `openid`/`profile`/`email` scopes, not delegated Graph access, so there's no
   admin-consent step to grant.

**This app registration lives in Aeon Synergies' real, existing corporate Microsoft 365
tenant — it is not an isolated sandbox.** This was confirmed directly: the browser-side
authorize URL check for Phase 4a Part 1 showed Microsoft's account picker listing real,
already-signed-in `@aeonsynergies.com` employee accounts. Treat this Azure AD app
registration, its client secret, and every account visible through it as real
infrastructure with real people behind it, not disposable test scaffolding. Concretely,
that means:
- Never complete a sign-in using an account that isn't yours or a dedicated test/service
  account you've been given permission to use — an account being one click away in the
  picker is not the same as having permission to use it.
- Full end-to-end verification of this feature (an actual completed Microsoft sign-in,
  confirmed to map to the correct existing user/role) has to be done deliberately by a
  real person on the team, ideally with a genuine test or service account rather than a
  named employee's.
- Rotating or deleting the client secret, or removing the app registration, affects real
  production auth for this tenant, not a scratch environment — coordinate before doing
  either.

A successful Microsoft sign-in maps to an **existing** row in the `users` table by email —
it never creates one. Exactly like password accounts, an Admin has to create the account
via Team Management first (same "no public self-registration" stance as password login);
Microsoft sign-in is an alternate way to authenticate into that same account, not a second
signup path. Signing in with an email that has no matching account redirects back to
`/login` with a clear explanation instead of silently creating one.

**IAM note (Phase 3a):** the AI-drafting feature needed a NAT Gateway added to the network
setup (see "What it provisions" below), which uses several EC2 actions the deploy
credentials may not have needed before: `ec2:CreateSubnet`, `ec2:DescribeInternetGateways`,
`ec2:CreateRouteTable`, `ec2:CreateRoute`, `ec2:DescribeRouteTables`,
`ec2:AssociateRouteTable`, `ec2:ReplaceRouteTableAssociation`, `ec2:AllocateAddress`,
`ec2:DescribeAddresses`, `ec2:CreateNatGateway`, `ec2:DescribeNatGateways`, and
**`ec2:CreateTags`** — a separate permission from the create-* actions themselves, needed
because every one of those resources is tagged inline (`--tag-specifications`) at creation
time; a policy that grants `ec2:CreateSubnet` etc. without `ec2:CreateTags` fails on the
tagging step, not the resource creation itself (confirmed live: the first deploy attempt
got past `CreateSubnet` cleanly and failed on `CreateTags` specifically). If the deploy
credentials' policy is scoped narrower than a blanket `ec2:*`, add these (same pattern as
the `apprunner:DeleteService` and `kms:Decrypt` additions earlier in this project's
history — each surfaced as a real `AccessDenied` from a live run, added once discovered).

**What it provisions** (idempotent — safe to re-run; only creates what's missing):
- Two ECR repositories (`aeon-api`, `aeon-web`)
- RDS for PostgreSQL: `db.t4g.micro`, 20GB gp3, **not publicly accessible**
- ElastiCache for Redis: `cache.t3.micro`, single node, **VPC-only** (ElastiCache has no
  public-access mode at all, at any instance size)
- An App Runner VPC Connector in the account's default VPC, and a security group scoped
  so only that connector can reach RDS/ElastiCache on 5432/6379
- A NAT Gateway (its own dedicated subnet + Elastic IP), with every default-VPC subnet's
  default route pointed at it (Phase 3a) — App Runner VPC Connector ENIs never get a
  public IP, so a route to the Internet Gateway alone isn't enough for the api service to
  reach a public API (e.g. `api.anthropic.com` for AI-assisted deck drafting); nothing
  before that needed outbound internet from inside the container at all, since RDS/Redis
  are both private, in-VPC-only targets. **This is a real, ongoing cost** — roughly
  $32–35/month for the NAT Gateway itself, on top of everything else below, not covered
  by the RDS/ElastiCache free-tier notes.
- IAM roles for App Runner (ECR image pull, and an instance role scoped to read exactly
  the SSM parameters it needs)
- `DATABASE_URL` / `REDIS_URL` / `JWT_ACCESS_SECRET` as SSM Parameter Store values
  (the first and last as SecureString), injected into the api service as App Runner
  runtime secrets — never as plain environment variables, never in a workflow log
- Two App Runner services (`aeon-api`, `aeon-web`), each deployed from its ECR image —
  **App Runner has no mode that builds from a Dockerfile in a git repo**; the two source
  types are buildpack-based source-code deploy (no Dockerfile involved) or a pre-built
  ECR image. CI builds the image and pushes it; App Runner only ever deploys it.

**Why RDS is private, not public:** ElastiCache forces a VPC Connector to exist
regardless (it has no public-access option at any size). Once that connector exists,
keeping RDS behind it too costs nothing extra and is strictly more secure than making
Postgres public for convenience — so both ended up on the "correct" side of the
public-vs-private tradeoff for the same setup cost.

**Deploy order** (handled automatically, since `VITE_API_URL` is baked into the web
image at build time and the api service's URL doesn't exist until it's created): build
+ push the api image → create/redeploy the api App Runner service → build the web image
with `VITE_API_URL` set to the api service's URL → create/redeploy the web App Runner
service → update the api service's `WEB_ORIGIN` to the web service's URL (only if it
changed, to avoid a redundant redeploy).

**Free Tier, checked (not assumed) as of this writing:** AWS changed the Free Tier model
on July 15, 2025. Accounts created *before* that date get the legacy fixed allocation —
750 hrs/month of a `db.t3`/`t4g.micro` RDS instance + 20GB storage, and 750 hrs/month of
a `cache.t3.micro` ElastiCache node (not `t4g`), both for 12 months. Accounts created
*after* that date get $100 in credits instead, with no fixed free allocation for any
specific service. If neither applies, budget roughly $25–35/month for RDS + ElastiCache
combined, plus App Runner's own compute charges.

**CI** (`.github/workflows/ci.yml`) runs on every PR against `main`: typechecks every
workspace package and builds both Dockerfiles (no push, no AWS credentials needed) —
this is what catches a broken build on the PR instead of after it's deployed.
