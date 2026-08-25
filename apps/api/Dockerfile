# Builds @aeon/api for AWS App Runner (deployed via ECR image, not App Runner's
# buildpack-based source deploy — see .github/workflows/deploy-aws.yml). Runs from the
# monorepo root as build context so pnpm workspace resolution works unmodified.

FROM node:20-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ---- deps: install with only manifests present, so this layer only rebuilds when a
# dependency actually changes, not on every source edit. --ignore-scripts because the
# root postinstall (builds @aeon/types/@aeon/database) needs their src/, which isn't
# copied in until the build stage below — running it here would fail on missing files.
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/database/prisma ./packages/database/prisma
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- build: bring in the real source, then run the same steps the root postinstall
# script would (types build, prisma generate, database build), plus the api's own build.
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/database packages/database
COPY packages/types packages/types
RUN pnpm --filter @aeon/types build \
  && pnpm --filter @aeon/database generate \
  && pnpm --filter @aeon/database build \
  && pnpm --filter @aeon/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4000
CMD ["pnpm", "--filter", "@aeon/api", "start:with-migrate"]
