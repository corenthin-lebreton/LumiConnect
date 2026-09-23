ARG NODE_VERSION=22.11.0
ARG PNPM_VERSION=10.6.5
ARG ALPINE_VERSION=3.20


# --- base : node + pnpm, uniquement pour costruire -------------------------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=true
# libc6-compat : binaires SWC de Next sur musl.
RUN apk upgrade --no-cache \
    && apk add --no-cache libc6-compat \
    && npm install -g pnpm@${PNPM_VERSION} \
    && npm cache clean --force
WORKDIR /app


# --- deps : dependances, invalidees par le lockfile seul --------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Le cache BuildKit conserve le store pnpm entre deux builds ; --store-dir est
# indispensable pour que le montage serve reellement de store.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store --prefer-offline


# --- builder : compilation Next en sortie standalone ------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# next-env.d.ts n'est pas versionne (gitignore) : Next le regenere au build.
COPY next.config.ts tsconfig.json postcss.config.mjs proxy.ts instrumentation.ts ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY types ./types
COPY public ./public
COPY scripts ./scripts

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_ORIGIN
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_APP_ORIGIN=${NEXT_PUBLIC_APP_ORIGIN} \
    NODE_ENV=production


RUN --mount=type=secret,id=env,target=/app/.env.production,required=false \
    pnpm run build


# --- runner : image finale --------------------------------------------------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner

ARG APP_PORT=8002
ARG IMAGE_VERSION=0.1.0

LABEL org.opencontainers.image.title="LumiConnect" \
      org.opencontainers.image.description="Console de provisionnement de VM Lumixen" \
      org.opencontainers.image.vendor="Lumixen" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.licenses="proprietary"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=${APP_PORT} \
    HOSTNAME=0.0.0.0

WORKDIR /app


RUN apk upgrade --no-cache \
    && apk add --no-cache tini \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs --shell /sbin/nologin nextjs


COPY --from=builder --chown=root:root /app/public ./public
COPY --from=builder --chown=root:root /app/.next/standalone ./
COPY --from=builder --chown=root:root /app/.next/static ./.next/static
COPY --from=builder --chown=root:root /app/scripts ./scripts
RUN install -d -o nextjs -g nodejs -m 750 /app/.next/cache \
    && chmod -R go-w /app

USER nextjs

EXPOSE ${APP_PORT}
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/sbin/tini", "--", "node", "server.js"]
