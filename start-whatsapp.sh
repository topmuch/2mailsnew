#!/bin/bash
# ─── Démarrage du mini-service WhatsApp (Task 79) ────────────────────────────
# Usage : bash start-whatsapp.sh
#
# Ce script démarre le mini-service WhatsApp sur le port 3003.
# Une fois démarré, va dans le CRM → Communication → WhatsApp pour scanner
# le QR code avec ton téléphone.

set -e
cd "$(dirname "$0")/mini-services/whatsapp"

echo "🚀 Démarrage du mini-service WhatsApp (port 3003)…"
echo ""

# Vérifie que les dépendances sont installées
if [ ! -d "node_modules" ]; then
  echo "📦 Installation des dépendances (premier démarrage)…"
  bun install
  echo "🔧 Génération du client Prisma…"
  bunx prisma generate
  echo ""
fi

# Vérifie que la DB est accessible
if [ ! -f ".env" ]; then
  echo "DATABASE_URL=file:/home/z/my-project/db/custom.db" > .env
fi

# Démarre le service (hot reload en dev)
echo "▶️  Service WhatsApp sur http://localhost:3003"
echo "📱 CRM → Communication → WhatsApp pour scanner le QR code"
echo "⏹️  Ctrl+C pour arrêter"
echo ""
exec bun run dev
