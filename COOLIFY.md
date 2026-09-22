# 🚀 Déploiement ETS LAMP FALL sur Coolify

Guide complet pour installer l'application de facturation **ETS LAMP FALL** sur un serveur avec [Coolify](https://coolify.io) (auto-hébergé).

---

## 1. Prérequis

- Un VPS (Ubuntu 22.04/24.04, Debian 12…) — **2 Go de RAM minimum recommandés**
- [Coolify installé](https://coolify.io/docs/installation) sur le serveur :

  ```bash
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
  ```

- Le dépôt GitHub du code : `https://github.com/topmuch/Lampfall` (ou `https://github.com/topmuch/2mailsnew`)
- Un sous-domaine ou domaine pointant vers l'IP du serveur (enregistrement DNS **A**), ex. `facture.mondomaine.sn` — optionnel mais recommandé (HTTPS automatique)

> ℹ️ Si le dépôt GitHub est **privé**, connecter d'abord GitHub dans Coolify (*Settings → Sources → GitHub App*) ou rendre le dépôt public.

---

## 2. Ce qui est déjà préparé dans le code

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Build multi-stage (Bun → Node 20) : installe les dépendances, génère le client Prisma, construit Next.js en mode *standalone* |
| `.dockerignore` | Exclut `node_modules`, la base locale et les fichiers d'atelier du contexte de build |
| `scripts/docker-entrypoint.sh` | Au démarrage du conteneur : crée le dossier de données, applique le schéma Prisma (`db push`), crée le compte admin si absent, lance le serveur |
| `scripts/seed-admin.mjs` | Crée les paramètres société et le compte administrateur (idempotent) |
| `src/app/api/health/route.ts` | Sonde de santé `/api/health` (200 = OK, 503 = base injoignable) |
| `docker-compose.yml` | Variante de déploiement *Docker Compose* avec volume nommé |
| `.env.example` | Liste des variables d'environnement |

**Comportement au premier démarrage :**

1. Dossier `/app/data` créé (base SQLite persistante)
2. Schéma Prisma appliqué → création de toutes les tables
3. Paramètres société par défaut + compte **admin** créé (`admin` / `admin123`, sauf si `ADMIN_PASSWORD` est défini)
4. Serveur Next.js démarré sur le port **3000**

---

## 3. Méthode A — Déploiement « Dockerfile » (recommandée)

### 3.1 Créer la ressource

1. Dans Coolify : **New Resource** → **Docker Based** → **Dockerfile**
2. Choix de la source : connecter le dépôt GitHub `topmuch/Lampfall`, branche `main`
3. Coolify détecte automatiquement le `Dockerfile` à la racine

### 3.2 Configurer le port

- Dans **Settings → General**, vérifier le **Port exposé** : `3000`
- Le `Dockerfile` déclare déjà `EXPOSE 3000`

### 3.3 Variables d'environnement (recommandé)

Dans l'onglet **Environment Variables** de la ressource :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `AUTH_SECRET` | chaîne aléatoire (`openssl rand -hex 32`) | 🔒 recommandé |
| `ADMIN_PASSWORD` | mot de passe admin initial | 🔒 recommandé |
| `DATABASE_URL` | `file:/app/data/lampfall.db` | non (défaut dans l'image) |
| `TZ` | `Africa/Dakar` | non (défaut dans l'image) |
| `PORT` | `3000` | non (défaut dans l'image) |

### 3.4 ⚠️ Stockage persistant (indispensable)

La base SQLite se trouve dans le conteneur : **sans volume, les données sont perdues à chaque redéploiement.**

1. Onglet **Storage** de la ressource → **Add Persistent Storage**
2. **Mount Path** : `/app/data`
3. Type : *Volume* (par défaut) → valider

### 3.5 Sonde de santé (optionnel)

- Onglet **Healthcheck** → *Path* : `/api/health`, *Port* : `3000`
- (le `Dockerfile` embarque déjà un `HEALTHCHECK` équivalent)

### 3.6 Domaine & HTTPS

- Onglet **Domains** : saisir `https://facture.mondomaine.sn` (le proxy Traefik de Coolify génère le certificat Let's Encrypt automatiquement)
- Cocher *Generate SSL certificate* si demandé

### 3.7 Déployer

Cliquer **Deploy**. Le premier build dure quelques minutes (téléchargement des images, `bun install`, `next build`). Suivre les logs de build en direct.

---

## 4. Méthode B — Déploiement « Docker Compose »

1. **New Resource** → **Docker Compose** → dépôt `topmuch/Lampfall`, branche `main`
2. Coolify lit `docker-compose.yml` : le service `lampfall`, le volume `lampfall-data` (`/app/data`) et le healthcheck sont déjà déclarés
3. Renseigner si besoin `AUTH_SECRET` et `ADMIN_PASSWORD` (variables d'environnement de la ressource)
4. **Deploy**, puis associer le domaine au **port 3000** dans l'onglet *Domains*

---

## 5. Première connexion

1. Ouvrir `https://facture.mondomaine.sn` (ou `http://IP-SERVEUR:3000`)
2. Identifier : **admin** / **admin123** (ou la valeur `ADMIN_PASSWORD` choisie)
3. ⚠️ **Changer immédiatement le mot de passe** : menu *Utilisateurs* → admin → modifier le mot de passe
4. Compléter les informations de la société (logo, RC, NINEA…) dans *Paramètres*
5. Facultatif : configurer la boîte mail (SMTP/IMAP) dans *Boîte mail → Configuration*

---

## 6. Mises à jour

- Pousser le nouveau code sur GitHub (`main`), puis dans Coolify : **Redeploy**
- Au redémarrage, le conteneur applique automatiquement l'évolution du schéma Prisma (`db push`) — **les données du volume `/app/data` sont conservées**
- En cas d'évolution **destructrice** du schéma, `db push` échoue volontairement (sans `--accept-data-loss`) : le log Coolify affiche l'erreur au lieu de supprimer des données

---

## 7. Sauvegardes

- **Coolify** : la ressource peut sauvegarder le volume `/app/data` (onglet *Backups* → planifier un `backup` S3 ou local)
- **Dans l'application** : menu *Sauvegarde* → export JSON complet téléchargeable (à faire régulièrement)
- La base est un unique fichier : `/app/data/lampfall.db` (copiable tel quel)

---

## 8. Dépannage

| Symptôme | Vérification |
|---|---|
| Conteneur « unhealthy » | Logs du conteneur dans Coolify ; tester `https://…/api/health` |
| « Environment variable not found: DATABASE_URL » | Garder la valeur par défaut `file:/app/data/lampfall.db` |
| Données perdues après redéploiement | Le volume `/app/data` n'a pas été ajouté (§ 3.4) |
| Logo flou / erreur optimisation d'image | Vérifier que le build est complet (le `Dockerfile` copie `sharp`) |
| Impossible de se connecter | Premier démarrage : `admin/admin123` ; sinon recréer via les logs du seed |
| Page blanche après déploiement | Vérifier le port 3000 dans *Settings → General* |

---

## 9. Notes techniques

- **SQLite = une seule instance** : ne pas activer le scaling horizontal (répliques multiples) sur cette ressource
- Fuseau horaire du conteneur : `Africa/Dakar` (défaut)
- L'image finale tourne sous **Node.js 20 slim** (Debian) ; le build utilise **Bun** avec le `bun.lock` du projet (installations reproductibles)
- Le mode *standalone* de Next.js réduit fortement la taille de l'image (`output: "standalone"` dans `next.config.ts`)
