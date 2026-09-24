import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  // Note : toute modification de ce fichier déclenche le redémarrage automatique
  // du worker next dev (utile après un `prisma generate` — nouveau client Prisma).
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // ── Correctif déploiement (OOM) ────────────────────────────────────────────
  // Par défaut `next build` lance (nbCœurs − 1) processus workers pour la
  // génération des pages statiques (7 workers sur le serveur 8 cœurs → chaque
  // worker est un process Node séparé → le build était tué sans message à
  // « Generating static pages » faute de mémoire). 1 seul worker = build plus
  // lent (49 pages) mais ~7× moins de RAM : passe sur un petit serveur.
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
