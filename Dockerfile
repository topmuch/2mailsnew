# 2MAILS — Dockerfile pour Coolify (dépôt PRIVÉ topmuch/2mailsnew)
#
# ⚠️ Le dépôt étant PRIVÉ, le clonage embarque un jeton GitHub via ARG GIT_TOKEN
#    (c'était la cause du bug « could not read Username for 'https://github.com' »).
#    Valeur par défaut intégrée ci-dessous ; surchargeable dans Coolify
#    (Environment Variables → type Build Arg → GIT_TOKEN=ghp_xxx) si le jeton change.
#
# ⚠️ Mises à jour : le layer « git clone » est mis en cache par Docker. Après un
#    nouveau push sur GitHub, déployer avec « Deploy without cache » (menu du
#    bouton Deploy dans Coolify) OU augmenter la valeur de CACHEBUST (1, 2, 3…).

FROM node:20-alpine

RUN apk add --no-cache git libc6-compat sqlite tzdata
RUN npm install -g bun

WORKDIR /app

# ── 1. Clonage du code (jeton requis : dépôt privé) ─────────────────────────
ARG CACHEBUST=1
ARG GIT_TOKEN=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
RUN git clone --depth 1 "https://x-access-token:${GIT_TOKEN}@github.com/topmuch/2mailsnew.git" . \
    && rm -rf .git

# ── 2. Dépendances + client Prisma ──────────────────────────────────────────
RUN bun install && npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/data/2mails.db

# ── 3. Base prête AVANT le build (les pages prérendues interrogent la base) ──
RUN mkdir -p /app/data && npx prisma db push --skip-generate --accept-data-loss

# ── 4. Build Next.js standalone (« bun run build » copie aussi .next/static
#      et public dans .next/standalone — CSS/JS servis sans 404) ─────────────
RUN bun run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=Africa/Dakar

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# ── 5. Démarrage : db push sur le volume persistant + compte admin + serveur ─
CMD ["/bin/sh", "scripts/docker-entrypoint.sh"]
