# ==============================================================================
# ETS LAMP FALL — Image Docker prête pour Coolify
#
# Build multi-stage :
#   1. deps    : installation des dépendances avec Bun (bun.lock)
#   2. builder : build Next.js en sortie « standalone »
#   3. runner  : exécution légère sous Node.js 20 (Debian slim)
#
# La base SQLite vit dans /app/data → à monter en volume persistant dans
# Coolify (onglet Storage). Le schéma Prisma et le compte admin sont créés
# automatiquement au premier démarrage (voir scripts/docker-entrypoint.sh).
#
# Port d'écoute : 3000 (surchargeable via la variable PORT)
# Santé du conteneur : GET /api/health
# ==============================================================================

# ─── Étape 1 : dépendances ────────────────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── Étape 2 : build de l'application ─────────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Client Prisma (moteurs compilés pour la plateforme de build)
RUN bunx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
# URL requise au moment du build uniquement — la vraie base vit dans le volume
ENV DATABASE_URL=file:/app/data/lampfall.db

# Script "build" : next build + copie de .next/static et public dans .next/standalone
RUN bun run build

# ─── Étape 3 : exécution ──────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# OpenSSL (moteurs Prisma), certificats TLS et fuseau horaire
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Africa/Dakar \
    DATABASE_URL=file:/app/data/lampfall.db

# Application autonome produite par Next (server.js, .next, node_modules tracés,
# public/ — les copies statiques sont déjà faites par le script "build")
COPY --from=builder /app/.next/standalone ./

# Prisma CLI + client + moteurs : « db push » est exécuté au démarrage du conteneur
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Sharp et ses binaires natifs (optimisation next/image en production)
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img

# Schéma + outils de démarrage
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/scripts/seed-admin.mjs ./scripts/seed-admin.mjs
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 3000

# Santé du conteneur — chemin à renseigner dans Coolify : /api/health
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]
