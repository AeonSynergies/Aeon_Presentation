# Builds @aeon/web for AWS App Runner (deployed via ECR image — see
# .github/workflows/deploy-aws.yml). VITE_API_URL must be passed as a build arg: it's
# read by import.meta.env at build time and baked into the client bundle, so it has to
# be known before this runs (i.e. the api service must exist first).

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# --ignore-scripts: see apps/api/Dockerfile — the root postinstall needs source that
# isn't copied in until the build stage.
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/database/prisma ./packages/database/prisma
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY apps/api apps/api
COPY packages/database packages/database
COPY packages/types packages/types
RUN pnpm --filter @aeon/types build \
  && pnpm --filter @aeon/database generate \
  && pnpm --filter @aeon/database build \
  && pnpm --filter @aeon/web build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.output /app/apps/web/.output
EXPOSE 3000
CMD ["node", "apps/web/.output/server/index.mjs"]
