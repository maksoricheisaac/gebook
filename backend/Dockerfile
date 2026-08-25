# Image de l'API NestJS.
#
# Trois particularités de ce projet dictent la forme du fichier :
#   - `argon2` est un module natif : il lui faut une chaîne de compilation
#     (`python3`, `make`, `g++`) et une base glibc. D'où `bookworm-slim` plutôt
#     qu'Alpine, dont la libc musl n'a pas de binaire pré-compilé publié.
#   - le client Prisma est généré dans `src/generated/prisma` (voir
#     `schema.prisma`) : `prisma generate` doit donc tourner AVANT `nest build`,
#     sinon la compilation TypeScript ne trouve pas les types.
#   - les migrations et le seed ont besoin des dépendances de développement
#     (`prisma`, `ts-node`). Elles vivent dans l'étape `migrator`, séparée de
#     l'image d'exécution qui, elle, reste réduite aux dépendances de production.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Dépendances complètes (production + développement)
# ---------------------------------------------------------------------------
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Compilation
# ---------------------------------------------------------------------------
FROM deps AS build
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
# Génère le client dans `src/generated/prisma` avant de copier le reste des
# sources, pour que ce travail soit réutilisé tant que le schéma ne bouge pas.
RUN pnpm exec prisma generate
COPY src ./src
RUN pnpm run build

# ---------------------------------------------------------------------------
# Dépendances de production seules
# ---------------------------------------------------------------------------
FROM deps AS prod-deps
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# Migrateur : `prisma migrate deploy` puis, si demandé, le seed.
# Conserve les dépendances de développement — `prisma` et `ts-node` en font partie.
# ---------------------------------------------------------------------------
FROM build AS migrator
ENV NODE_ENV=development
CMD ["pnpm", "run", "db:deploy"]

# ---------------------------------------------------------------------------
# Image d'exécution
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Les couvertures livrées avec le dépôt. Le volume monté sur `/app/storage`
# hérite de ce contenu à sa création, donc le catalogue de démonstration
# s'affiche dès le premier démarrage.
COPY storage ./storage

# `LocalStorageDriver` résout `storage/` depuis `process.cwd()` : le répertoire
# de travail n'est pas cosmétique ici, il détermine où atterrissent les fichiers.
WORKDIR /app
RUN chown -R node:node /app/storage
USER node

EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/main"]
