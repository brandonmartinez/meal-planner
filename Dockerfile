# syntax=docker/dockerfile:1

# Pin the base image by digest for reproducible builds across all stages.
# The `node:22-alpine` tag is kept for readability; the digest is authoritative.
# Bump both together when intentionally upgrading the base image.
ARG NODE_IMAGE=node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

# Stage 1: Install dependencies
FROM ${NODE_IMAGE} AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/mcp/package.json ./packages/mcp/
# Strict, reproducible install: fail on a stale/missing lockfile (no unlocked fallback).
# BuildKit cache mount keeps the pnpm content-addressable store warm across builds
# without affecting what gets installed (the lockfile remains the source of truth).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Stage 2: Build
FROM ${NODE_IMAGE} AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY . .
RUN pnpm --filter @meal-planner/shared run build
RUN pnpm --filter @meal-planner/api run db:generate
RUN pnpm --filter @meal-planner/api run build
RUN pnpm --filter @meal-planner/web run build
# Create a self-contained production deploy (resolves pnpm symlinks)
RUN pnpm --filter @meal-planner/api deploy --prod /app/deploy
# Generate Prisma client within the deploy directory
RUN cd /app/deploy && npx prisma generate --schema=./prisma/schema.prisma

# Stage 3: Production
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy runtime artifacts owned by the built-in unprivileged `node` user so the
# entrypoint (prisma migrate deploy) and the API can read/execute them without root.
COPY --from=builder --chown=node:node /app/deploy/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/deploy/package.json ./package.json
COPY --from=builder --chown=node:node /app/packages/api/dist ./dist
COPY --from=builder --chown=node:node /app/packages/api/prisma ./prisma
COPY --from=builder --chown=node:node /app/packages/web/dist ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Drop root: run the final container as the unprivileged `node` user.
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
