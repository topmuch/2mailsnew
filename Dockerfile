# 2MAILS — Dockerfile de production (Coolify / Dokploy) — BUILD MULTI-STAGE
#
# ⚠️ Pourquoi multi-stage ? La version précédente produisait une image de
#    ~2,3 Go (bun + git + node_modules complets + sources + build dans le même
#    stage) → l'EXPORT de l'image échouait (« exporting layers » puis
#    « Deployment failed »). L'image finale ne garde désormais que le strict
#    nécessaire (~700 Mo) : Node.js + sortie standalone + client/CLI Prisma +
#    scripts de démarrage. Le stage de construction est jeté après le build.
#
# Deux modes de build couverts :
#  1. « Dockerfile location = /Dockerfile » : le contexte EST le dépôt → COPY direct.
#  2. « Dockerfile collé » dans l'UI : contexte vide → clonage GitHub de secours
#     (dépôt PRIVÉ → jeton requis via ARG GIT_TOKEN). Après un nouveau push,
#     déployer avec « Deploy without cache » OU augmenter CACHEBUST (1, 2, 3…)
#     sinon le layer de clonage réutilise l'ancien code.

# ── STAGE 1 : construction (jeté après le build) ────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache git libc6-compat sqlite tzdata
RUN npm install -g bun

WORKDIR /app

# Copie du dépôt depuis le contexte de build fourni par la plateforme
COPY . /app/

# Filet de sécurité : contexte sans le dépôt (mode Dockerfile collé) → clonage
# vers un dossier temporaire puis copie (fonctionne même si /app n'est pas vide)
ARG CACHEBUST=1
ARG GIT_TOKEN=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
RUN if [ ! -f package.json ] || [ ! -d src ] || [ ! -d prisma ]; then \
      echo "⚠ Contexte de build sans dépôt → clonage GitHub de secours…" && \
      git clone --depth 1 "https://x-access-token:${GIT_TOKEN}@github.com/topmuch/2mailsnew.git" /tmp/2mails-repo && \
      cp -a /tmp/2mails-repo/. /app/ && \
      rm -rf /tmp/2mails-repo ; \
    fi

# Dépendances + client Prisma (caches nettoyés DANS le même RUN pour alléger
# le layer)
RUN bun install && npx prisma generate \
    && rm -rf /root/.bun/install/cache /root/.npm

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/data/2mails.db

# Base prête AVANT le build (les pages prérendues interrogent la base)
RUN mkdir -p /app/data && npx prisma db push --skip-generate --accept-data-loss

# Build Next.js standalone (« bun run build » copie aussi .next/static et
# public dans .next/standalone — CSS/JS servis sans 404)
RUN bun run build \
    && rm -rf /app/.next/cache /app/node_modules/.cache

# CLI Prisma ISOLÉE pour le stage d'exécution (db push au démarrage) : le
# bundle prisma 6.x requiert « effect », « @prisma/config »… qui ne sont pas
# embarqués dans build/index.js → installation complète dans un dossier dédié,
# à la version exacte du projet.
RUN mkdir -p /opt/prisma-cli && cd /opt/prisma-cli \
    && echo '{}' > package.json \
    && bun add "prisma@$(node -p "require('/app/node_modules/prisma/package.json').version")" \
    && rm -rf /root/.bun/install/cache

# ── STAGE 2 : exécution (image finale légère, ~700 Mo au lieu de ~2,3 Go) ───
FROM node:20-alpine

# curl : requis par le healthcheck Coolify (sondage /api/health) — le
# HEALTHCHECK Docker du fichier utilise node/fetch, mais Coolify peut
# exécuter son propre sondage avec curl/wget ; sans curl dans l'image,
# le conteneur est déclaré « not healthy » → rollback.
RUN apk add --no-cache libc6-compat sqlite tzdata curl

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    TZ=Africa/Dakar \
    DATABASE_URL=file:/app/data/2mails.db

# Serveur standalone autonome (node_modules tracés + .next/static + public)
COPY --from=builder /app/.next/standalone /app/.next/standalone

# Client Prisma COMPLET (moteur de requête inclus) :
#  - dans standalone : filet anti-tracing pour le serveur Next.js
#  - à la racine : requis par scripts/seed-admin.mjs
COPY --from=builder /app/node_modules/.prisma /app/.next/standalone/node_modules/.prisma
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma /app/node_modules/@prisma

# CLI Prisma isolée (db push au démarrage) + scripts (seed admin) + schéma + manifest
COPY --from=builder /opt/prisma-cli /app/prisma-cli
COPY --from=builder /app/scripts /app/scripts
COPY --from=builder /app/prisma /app/prisma
COPY --from=builder /app/package.json /app/package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Démarrage : db push sur le volume persistant + compte admin + serveur
# (scripts/docker-entrypoint.sh : 100 % Node.js, aucun besoin de bun/git ici)
CMD ["/bin/sh", "scripts/docker-entrypoint.sh"]
