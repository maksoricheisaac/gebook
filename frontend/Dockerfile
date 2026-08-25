# Image du frontend Next.js.
#
# `NEXT_PUBLIC_API_URL` est un argument de construction, pas seulement une
# variable d'exécution : Next.js remplace toute référence `process.env.NEXT_PUBLIC_*`
# par sa valeur littérale au moment du `build`. La renseigner uniquement dans
# `docker-compose.yml` produirait une image où l'URL est figée à « indéfinie ».

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Dépendances complètes
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Compilation
# ---------------------------------------------------------------------------
FROM deps AS build
# L'API n'est jamais appelée depuis le navigateur : tout passe par les relais
# `app/api/*`, qui tournent côté serveur Next.js. Le nom de service Docker
# `backend` est donc une valeur valable — il n'a pas à être résolvable
# publiquement.
ARG NEXT_PUBLIC_API_URL=http://backend:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm run build

# ---------------------------------------------------------------------------
# Dépendances de production seules
# ---------------------------------------------------------------------------
FROM deps AS prod-deps
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# Image d'exécution
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts

USER node

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=25s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/ || exit 1

CMD ["node_modules/.bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
