#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# ETS LAMP FALL — point d'entrée du conteneur Docker (Coolify)
#
#  1. Prépare le dossier de la base SQLite (volume persistant /app/data)
#  2. Synchronise le schéma Prisma (crée la base au premier démarrage,
#     applique les évolutions de schéma aux redémarrages suivants)
#  3. Crée le compte administrateur par défaut si absent (idempotent)
#  4. Démarre le serveur Next.js standalone (respecte $PORT et $HOSTNAME)
# ─────────────────────────────────────────────────────────────────────────────
set -e

PORT="${PORT:-3000}"
export PORT
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

echo "── ETS LAMP FALL — démarrage du conteneur ──"

# 1. Dossier de données déduit de DATABASE_URL (ex. file:/app/data/lampfall.db)
DB_PATH="${DATABASE_URL#file:}"
DB_DIR="$(dirname "$DB_PATH")"
mkdir -p "$DB_DIR"
echo "• Base de données : $DATABASE_URL"

# 2. Schéma Prisma — --accept-data-loss REQUIS : avec SQLite, Prisma reconstruit
#    la table (copie des données) dès qu'une contrainte change (ex. ajout de la
#    contrainte unique shareToken sur une colonne NOUVELLE → toutes les lignes
#    existantes auront NULL, aucune violation possible, aucune perte réelle).
#    Sans ce drapeau, l'avertissement générique de Prisma fait échouer le
#    démarrage du conteneur (set -e) → Coolify rollback. Même drapeau que le
#    db push du build (Dockerfile). CLI Prisma isolée (image multi-stage) ;
#    repli sur node_modules si présent.
PRISMA_CLI="/app/prisma-cli/node_modules/prisma/build/index.js"
[ -f "$PRISMA_CLI" ] || PRISMA_CLI="/app/node_modules/prisma/build/index.js"
node "$PRISMA_CLI" db push --skip-generate --accept-data-loss

# 3. Compte administrateur (admin / ADMIN_PASSWORD ou admin123 par défaut)
node /app/scripts/seed-admin.mjs

# 4. Serveur Next.js (build standalone : .next/standalone/server.js)
echo "• Serveur Next.js sur le port $PORT (santé : /api/health)"
exec node /app/.next/standalone/server.js
