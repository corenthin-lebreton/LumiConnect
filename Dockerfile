ARG NODE_VERSION=22.11.0
ARG PNPM_VERSION=10.6.5
ARG ALPINE_VERSION=3.20

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base
ARG PNPM_VERSION
# Install pnpm globally via npm. corepack on recent Node 22.x has known
# integrity-key issues (https://github.com/nodejs/corepack/issues/612) that
# break `corepack prepare` in fresh containers — installing pnpm directly is
# faster, smaller, and avoids the broken signature path entirely.
RUN apk add --no-cache libc6-compat \
    && npm install -g pnpm@${PNPM_VERSION} \
    && npm cache clean --force
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY next.config.ts tsconfig.json next-env.d.ts middleware.ts ./
COPY postcss.config.mjs eslint.config.mjs components.json ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY types ./types
COPY public ./public
COPY worker ./worker
COPY tools ./tools
COPY scripts ./scripts

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=env,target=/app/.env.production,required=false \
    pnpm run build

# Bundle autonome du worker : un seul fichier, aucun node_modules à l'exécution.
RUN pnpm run worker:build


# ---------------------------------------------------------------------------------------
# Worker — consomme la file `jobs` et exécute déploiements et nettoyages.
#
# Image séparée de l'image web, et volontairement sans node_modules : le bundle esbuild
# embarque déjà tout. Elle ne publie aucun port, elle ne parle qu'à Postgres, Proxmox,
# pfSense et Guacamole.
# ---------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS worker

LABEL org.opencontainers.image.title="LumiConnect worker" \
      org.opencontainers.image.description="File de provisioning et de configuration des VMs" \
      org.opencontainers.image.vendor="Lumixen" \
      org.opencontainers.image.licenses="proprietary"

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache tini \
    && addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 --ingroup nodejs worker

COPY --from=builder --chown=worker:nodejs /app/dist/worker.cjs ./worker.cjs
# La bibliothèque est lue au moment d'exécuter un script, depuis le disque.
COPY --from=builder --chown=worker:nodejs /app/scripts ./scripts

USER worker

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "worker.cjs"]


FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner

LABEL org.opencontainers.image.title="AutoDeploy" \
      org.opencontainers.image.description="Lumixen VM provisioning console" \
      org.opencontainers.image.vendor="Lumixen" \
      org.opencontainers.image.licenses="proprietary"

WORKDIR /app

ARG APP_PORT=8002
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=${APP_PORT} \
    HOSTNAME=0.0.0.0


RUN apk add --no-cache wget tini \
    && addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 --ingroup nodejs nextjs


COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

EXPOSE ${APP_PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/api/healthz" || exit 1


ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 PORT=${PORT} node server.js"]
