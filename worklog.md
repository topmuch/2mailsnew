# Worklog — ETS LAMP FALL : Système de Facturation

---
Task ID: 1
Agent: Z.ai Code (principal)
Task: Créer un système de facturation complet pour ETS LAMP FALL (factures vente/proforma, statuts livré/non livré & payé/non payé, PDF, factures d'achat avec pièce jointe, clients avec dates d'achat, recherche multi-critères, commandes prévisionnelles exportables en PDF, catalogue produits 11 catégories, logo extrait du PDF fourni).

Work Log:
- Extrait le logo ETS LAMP FALL du PDF `upload/ets lamp fall.pdf` via PyMuPDF → `public/logo.png` (PNG haute résolution 1739x1485).
- Installé `jspdf` + `jspdf-autotable` (génération PDF côté client).
- Défini le thème vert (charte du logo) dans `src/app/globals.css` (variables oklch, sidebar vert foncé, scrollbars personnalisées).
- Mis à jour `src/app/layout.tsx` (lang fr, métadonnées, favicon logo).
- Écrit `prisma/schema.prisma` : modèles Client, Product, Invoice (+InvoiceItem), Purchase (+PurchaseItem), Order (+OrderItem). Push DB SQLite.
- Créé `prisma/seed.ts` (23 produits toutes catégories, 6 clients, 10 factures/proformas, 3 achats, 3 commandes) et exécuté.
- Créé `src/lib/constants.ts` (catégories, statuts, formateurs FCFA/dates, numérotation FV/PF/FA/CMD-année-0001).
- Créé `src/lib/types.ts` (types partagés frontend/API) et `src/hooks/use-fetch.ts` (fetch + debounce).
- Créé `src/lib/pdf.ts` : facture/proforma PDF (en-tête logo, badges statuts, tableau articles, TVA, totaux, montant en lettres français, filigrane PAYÉ/PROFORMA, pied de page), bon de commande, liste des commandes, bon d'achat, listes de factures.
- API routes : `/api/clients` (CRUD), `/api/products` (CRUD + filtres), `/api/invoices` (CRUD + filtres q/statuts/dates/montants/clientId + numérotation auto + décrément stock en transaction), `/api/invoices/[id]/convert` (proforma→vente), `/api/purchases` (multipart avec upload fichier vers `db/uploads/` + incrément stock), `/api/purchases/[id]/file` (service pièce jointe), `/api/orders` (CRUD + filtres), `/api/orders/[id]/convert` (commande→facture), `/api/dashboard` (stats, CA 6 mois, top catégories, alertes stock).
- UI (shadcn/ui) : `app-shell.tsx` (sidebar verte desktop + drawer mobile + footer sticky mt-auto), `dashboard-view.tsx`, `invoices-view.tsx` (résumés, recherche q, filtres paiement/livraison/dates/montants, export PDF liste, menus d'actions), `invoice-dialog.tsx`, `items-editor.tsx` (éditeur d'articles avec sélecteur catalogue + articles libres), `clients-view.tsx` (CRUD + historique des achats par client), `products-view.tsx`, `purchases-view.tsx` (upload scan PDF/image ≤5 Mo), `orders-view.tsx` (+ conversion en facture), `status-badges.tsx`.
- Corrigé : filigrane jsPDF qui ne réinitialisait pas l'opacité GState (contenu délavé) ; seed dont les items n'avaient pas productId (stock non décrémenté à la conversion) ; graphique mensuel (hauteurs fixes) ; montants tronqués des cartes.
- Vérifié via agent-browser : dashboard (stats, graphique, alertes stock, dernières factures + PDF), création de facture FV-2026-0008 (TVA 18 % calculée, stock Cabine 4→3), PDF facture parfait (badges, totaux, montant en lettres), conversion proforma→facture, export liste commandes (aucune erreur console), bon de commande PDF, achat avec upload + ouverture de la pièce jointe, suppression achat, recherche "Diop" (2 factures), filtre montant min (1 facture), vue produits 11 catégories, historique client avec dates d'achat, responsive mobile 390px (menu drawer, cartes 2 colonnes, footer naturellement poussé).
- Lint final : 0 erreur, 0 warning. dev.log : aucune erreur runtime.

Stage Summary:
- Application complète sur la seule route `/` (navigation par vues), stack Next.js 16 + TypeScript + Prisma/SQLite + shadcn/ui + Tailwind 4 + jsPDF.
- Tous les besoins exprimés sont couverts : statuts livré/non livré et payé/partiel/non payé, proforma convertissable, factures PDF téléchargeables/visualisables, factures d'achat archivées avec pièce jointe, clients avec historique et dates d'achat, recherche par numéro/nom/montant/date, commandes prévisionnelles avec liste exportable en PDF et conversion en facture, catalogue des 11 catégories demandées, logo ETS LAMP FALL intégré (app + PDF).
- Données de démonstration réalistes (FCFA, clients et produits sénégalais) rechargées après correction du seed.

---
Task ID: 2
Agent: Z.ai Code (principal)
Task: Lot d'améliorations demandé : (1) retirer le texte « Document prévisionnel — non valable comme facture définitive » du PDF proforma ; (2) retirer la colonne « Catégorie » des PDF facture/proforma ; (3) historique des achats client en pleine page (plus de modale) avec factures/proformas téléchargeables en PDF depuis l'historique ; (4) création/suppression de catégories dans Produits ; (5) image produit ; (6) nouvel onglet « Immo » (dossiers locataires : immeuble, loyer mensuel, mois, payé/non payé).

Work Log:
- Schéma Prisma : ajout des modèles `Category` (code/label dynamiques), `Tenant` + `Rent` (immobilier, unique tenantId+month) et du champ `Product.image` (data-URL). `bun run db:push` OK.
- Seed `prisma/seed-v2.ts` : upsert des 11 catégories d'origine en base + 3 dossiers immobiliers de démo (dont l'exemple exact de la demande : Moussa Diop / Immeuble F / 200 000 CFA / juillet non payé) + loyers sur plusieurs mois.
- API : `/api/categories` (GET avec productCount, POST avec code auto sans accents), `/api/categories/[code]` (DELETE bloqué si des produits l'utilisent), `/api/products` + `/api/products/[id]` (champ image via `sanitizeImage`, validation catégorie contre la base via `src/lib/product-validation.ts`), `/api/tenants` (GET incluant les loyers, POST), `/api/tenants/[id]` (PUT/DELETE), `/api/rents` (POST, mois AAAA-MM, doublon bloqué), `/api/rents/[id]` (PUT statut/montant, DELETE).
- PDF (`src/lib/pdf.ts`) : tableau des articles allégé (Désignation/Qté/PU/Total — plus de colonne Catégorie, pour facture, proforma, bon de commande et bon d'achat) ; texte proforma « non valable… » supprimé ; nouveaux documents `buildClientHistoryPDF` (historique des achats client), `buildRentReceiptPDF` (quittance payée / avis d'échéance non payée avec filigrane, montant en lettres, encadré statut) et `buildTenantRentsPDF` (échéancier des loyers).
- Front : nouveau `CategoriesProvider` (contexte React + repli statique si base vide) consommé par `CategoryBadge` (labels dynamiques), `products-view` et la gestion des catégories.
- `products-view.tsx` : bouton « Catégories » → dialog de gestion (créer, supprimer avec confirmation et erreur claire si produits rattachés) ; photo produit (choix fichier → redimensionnement canvas 640px JPEG → data-URL, aperçu, retrait) ; vignette image dans la liste.
- `client-detail-view.tsx` (nouveau) : fiche client pleine page — coordonnées, stats (achats, proformas, total facturé, reste à payer, dernier achat), historique complet avec badges paiement/livraison et boutons PDF (télécharger + afficher) par document, export « Historique PDF ». `clients-view.tsx` : navigation liste ↔ fiche (plus de modale d'historique), dialog d'édition factorisé.
- `immo-view.tsx` (nouveau) : stats (locataires, loyers attendus, encaissé du mois, impayés), recherche, cartes dossiers locataires (badge statut du mois courant + nb mois impayés), échéancier du locataire sélectionné (mois/montant/statut/réglé le, bascule payé↔non payé, quittance PDF, suppression), ajout d'échéance (mois + montant prérempli + statut), CRUD locataire, échéancier PDF exportable. Onglet « Immo » ajouté à la sidebar (icon Building2).
- Correctifs au passage : débordement horizontal en mobile (cards dashboard + panneau échéancier `overflow-hidden/min-w-0/overflow-auto` → scrollWidth 390/390 sur toutes les vues) ; erreur d'hydratation Radix (aria-controls useId) au premier chargement résolue via rendu du Sheet mobile après montage (`useSyncExternalStore`).
- Vérifié via agent-browser : PDF proforma sans disclaimer ni colonne catégorie (screenshot + extraction texte PyMuPDF), PDF facture idem, fiche client pleine page + téléchargement PDF individuel + export historique, catégories (création « Carrelage », suppression vide OK, suppression bloquée avec message), produit avec image (upload, aperçu, vignette liste), Immo complet (stats, échéancier Moussa Diop avec juillet non payé, bascule payé/non payé avec toast, quittance/avis PDF, ajout loyer octobre puis suppression, création locataire Fatou Sow), retour fiche→liste, mobile 390px toutes vues sans scroll horizontal, footer poussé naturellement.
- Lint final : 0 erreur, 0 warning. dev.log : aucune erreur runtime. Quittances/historique/échéancier validés par extraction texte (montant en lettres, statuts, dates de règlement).

Stage Summary:
- Les 6 demandes du lot sont livrées et vérifiées dans le navigateur : PDF proforma épuré (plus de mention « non valable », plus de catégorie), factures épurées, historique client en pleine page avec PDF téléchargeables par document et export d'historique, catégories produits dynamiques (création/suppression protégée), photo produit, et un module Immobilier complet avec quittances PDF.
- Nouveaux artefacts : `src/components/categories-provider.tsx`, `client-detail-view.tsx`, `immo-view.tsx`, `src/app/api/categories/*`, `src/app/api/tenants/*`, `src/app/api/rents/*`, `src/lib/product-validation.ts`, `prisma/seed-v2.ts`.

---
Task ID: 3
Agent: Z.ai Code (principal)
Task: (1) Refonte du design du dashboard en s'inspirant du dashboard de ventes fourni en image ; (2) bouton sombre/clair « version luxueuse » violet ; (3) écran Paramètres société (nom, adresse, logo, RC, NINEA, tél, email) injecté dans les factures ; (4) gestion des utilisateurs (admin + employés) avec rôles ; (5) création du repo GitHub « Lampfall » chez topmuch et push.

Work Log:
- Schéma Prisma : ajout des modèles `Setting` (nomSociete, tagline, adresse, telephone, email, rc, ninea, logo data-URL) et `User` (username unique, name, password scrypt, role ADMIN|EMPLOYE, actif). `bun run db:push` + `prisma/seed-v3.ts` (paramètres par défaut + compte admin admin/admin123).
- API : `/api/auth/login` (jeton HMAC-SHA256 7 jours), `/api/auth/me`, `/api/auth/password` (changement de mot de passe), `/api/users` GET/POST et `/api/users/[id]` PUT/DELETE (réservés ADMIN, protections dernier admin / auto-désactivation), `/api/settings` GET/PUT (PUT réservé ADMIN, logo ≤ ~2,5 Mo validé data:image). Lib `src/lib/auth.ts` (scrypt + HMAC + timingSafeEqual) et `src/lib/auth-client.ts` (authFetch + session localStorage).
- `/api/dashboard` étendu : CA des 12 mois d'une année (?year=), CA par jour du mois (?month=) pour le calendrier, tranches de facturation (< 50k, 50k–200k, 200k–500k, 500k–1M, > 1M), top 5 clients par revenu ; types `DashboardStats/Settings/AuthUser/UserRecord` mis à jour.
- Thème violet luxueux : `globals.css` entièrement réécrit (clair : lavande/blanc + violet profond + or oklch(0.72 0.13 80) ; sombre : violet-noir + violet lumineux + or), variables `--gold/--gold-soft`, utilitaires luxe (`.text-luxe-gradient`, `.luxe-banner`, `.card-luxe` liseré violet→or, `.theme-toggle-luxe`, `.theme-toggle-knob`, `.nav-luxe-active`, `.shadow-luxe`), scrollbars violettes.
- `theme-provider.tsx` (next-themes, class, light par défaut) + `theme-toggle.tsx` : pilule dégradé violet→or avec poignée dorée animée (framer-motion, spring) et icônes soleil/lune pivotantes — monté via `useSyncExternalStore` (conforme règle react-hooks).
- Écran de connexion `login-view.tsx` : split-screen violet luxueux (panneau marque dégradé + logo + arguments, panneau formulaire), gestion d'erreurs, encart premier-utilisation avec identifiants admin par défaut.
- `app-shell.tsx` réécrit : porte d'authentification (loading → login → app), navigation filtrée par rôle (Utilisateurs + Paramètres visibles ADMIN uniquement), barre supérieure desktop (date dorée, ThemeToggle, menu utilisateur avec rôle/initials/changement mot de passe/déconnexion), header mobile avec ThemeToggle, CompanyLogo & nom/slogan/contacts dynamiques depuis le store `settings-store.ts` (zustand), footer collant avec RC/NINEA.
- Dashboard `dashboard-view.tsx` refondu façon image fournie : bandeau titre « Tableau de bord des ventes — Année {year} » (dégradé violet→or, navigation d'année), 4 cartes KPI à pastilles dégradées (violet/rose/orange/teal : Total Revenu, Nombre Factures, Nombre Clients, Commandes en cours), mini-indicateurs (Encaissé, Impayés, Proformas, Achats fournisseurs — format compact k/M FCFA), carte « Période Calendaire » (onglets JAN→DÉC, grille lundi-premier, heatmap CA par jour violet avec légende + infobulles), « Montant par tranche de facturation » (barres horizontales dégradées violet→rose), « Top 5 — Revenu par client » (barres verticales orange) et « Total Revenu par catégorie » (barres teal) avec pastilles « Détails » alignées, Dernières factures (PDF) + Alertes stock (vignettes produits).
- `settings-view.tsx` : formulaire complet (nom, slogan, adresse, téléphone, email, RC, NINEA), upload/aperçu/retrait du logo (redimensionnement canvas 512px JPEG), enregistrement avec rafraîchissement du store + invalidation du cache PDF.
- `users-view.tsx` : table des comptes (avatar initiales, badge rôle, switch d'activation désactivé sur soi), dialog création/édition (nom, identifiant, mot de passe, rôle ADMIN/EMPLOYE, actif), suppression avec confirmation, gestion d'erreurs serveur (identifiant dupliqué, dernier admin…).
- PDF `pdf.ts` : `loadCompanyInfo()` charge `/api/settings` (cache + `invalidateCompanyCache()`), en-tête et pied de page construits depuis les paramètres (nom, slogan, adresse, tél, email, RC, NINEA), logo des paramètres prioritaire sur /logo.png avec détection de format PNG/JPEG pour addImage.
- Correctifs UI : badges Particulier/Entreprise lisibles en mode sombre ; warning Next Image (aspect-ratio logo) corrigé ; format monétaire compact `formatMoneyCompact`.
- Vérifié via agent-browser : écran de connexion (capture), connexion admin, dashboard clair + sombre (captures), toggle thème animé, calendrier avec CA du mois (8 sept = jour fort), tranches calculées sur les données réelles, création utilisateur employé « fsow » puis reconnexion employé (Utilisateurs/Paramètres absents de la nav — gating OK), Paramètres : saisie RC « SN-DKR-2024-B-12345 » + NINEA « 007654321 0001A », upload logo (image de test) puis retrait, téléchargement réel de Facture-FV-2026-0007.pdf avec extraction texte PyMuPDF confirmant RC/NINEA en en-tête et pied de page, mobile 390 px (drawer, scrollWidth 390, footer collé), console sans erreur bloquante.
- Lint final : 0 erreur, 0 warning. dev.log : aucune erreur runtime.
- GitHub : repo `topmuch/Lampfall` créé via API (public, description), `.gitignore` complété (/db/, /download/, /upload/ + retrait du suivi), commit et push sur `main` (vérifié : 19 fichiers components distants, commit 899f4c9), URL remote nettoyée du jeton.

Stage Summary:
- Les 5 demandes sont livrées et vérifiées dans le navigateur : dashboard premium fidèle à l'image (KPI colorés, calendrier heatmap mensuel, tranches, top clients/catégories, boutons Détails), toggle sombre/clair luxueux violet & or, Paramètres société injectés dans l'app et dans les PDF (RC/NINEA/logo), gestion utilisateurs ADMIN/EMPLOYÉ avec rôles et protections, repo GitHub https://github.com/topmuch/Lampfall alimenté.
- Identifiants par défaut : admin / admin123 (à modifier). Compte employé de démonstration : fsow / fsow2024.
- Nouveaux artefacts : prisma/seed-v3.ts, src/lib/auth.ts, src/lib/auth-client.ts, src/lib/settings-store.ts, src/components/{login-view,settings-view,users-view,theme-provider,theme-toggle}.tsx, src/app/api/{auth/*,users/*,settings}/*.

---
Task ID: 4
Agent: Z.ai Code (principal)
Task: Réorganiser les onglets du sidebar.

Work Log:
- `src/components/app-shell.tsx` : ajout d'un champ `section` à chaque entrée de NAV et réécriture de `NavItems` pour regrouper les onglets avec des intitulés de section (majuscules discrètes), partagés desktop + drawer mobile.
- Nouvel ordre : Pilotage (Dashboard) → Ventes (Factures, Proforma, Commandes, Clients) → Achats & stock (Achats, Produits) → Immobilier (Immo) → Administration (Utilisateurs, Paramètres, admin seul).
- « Clients » déplacé dans le groupe Ventes (cohérence métier : les clients appartiennent au cycle de vente) ; les ID de vues sont inchangés, aucune régression sur la navigation.
- Vérifié via agent-browser : sidebar desktop avec les 5 sections, navigation « Clients » fonctionnelle, drawer mobile 390 px avec sections + état actif doré, aucune erreur console bloquante.
- Commit `6fb2a98` (push GitHub non refait : le jeton précédent a été retiré du remote pour sécurité).

Stage Summary:
- Sidebar réorganisé en 5 sections logiques et vérifié sur desktop + mobile ; comportement et rôles (admin/employé) inchangés.

---
Task ID: 5
Agent: Z.ai Code (principal)
Task: Ajouter un module « Rapports de vente ».

Work Log:
- API `GET /api/reports/sales?from=&to=` : synthèse (nb factures, CA HT/TVA/CA TTC, encaissé, reste, panier moyen, articles vendus, compteurs paiement/livraison), évolution mensuelle, top 10 clients, ventes par catégorie (quantité + montant), top 10 produits, détail des factures VENTE de la période (fallback : année courante).
- Types `SalesReport`/`SalesReportSummary` ajoutés à `src/lib/types.ts`.
- PDF `buildSalesReportPDF(report, periodLabel)` dans `src/lib/pdf.ts` : en-tête société (paramètres), tableau de synthèse 8 colonnes, ligne des statuts, sections Évolution mensuelle (avec totaux), Top clients, Ventes par catégorie, Top produits, Détail des factures (avec pied TOTAL), sauts de page automatiques.
- Vue `reports-view.tsx` : sélecteur de période (6 préréglages + dates personnalisées), 4 cartes KPI dégradées, 8 mini-indicateurs, histogramme « Évolution mensuelle du CA », Top clients et Ventes par catégorie en barres horizontales, tableaux Top produits et Détail des factures (max-h-96 scrollable) avec PDF individuel par facture, export du rapport complet en PDF (télécharger + aperçu) et en CSV (BOM UTF-8, séparateur ;), état vide soigné, boutons désactivés si aucune donnée.
- Sidebar : nouvel onglet « Rapports » (icône BarChart3) dans la section Ventes, après Clients ; ViewId « rapports » + rendu dans app-shell.
- Vérifié via agent-browser : vue complète (KPI 2,49 M / 1,52 M / 965 k / 7), graphique mensuel (08/26 : 1,75 M ; 09/26 : 741 k), top clients/catégories/produits, export PDF 2 pages validé par extraction texte (synthèse, totaux, toutes les sections), export CSV (10 colonnes, BOM), PDF individuel FV-2026-0007 retéléchargé, préréglage « Aujourd'hui » → état vide + boutons désactivés, mobile 390 px sans scroll horizontal, mode sombre OK, aucune erreur console/serveur.
- Lint : 0 erreur, 0 warning.

Stage Summary:
- Module Rapports de vente opérationnel : analyse par période avec préréglages, synthèse financière, graphiques, top clients/catégories/produits, détail facturable, exports PDF (rapport complet façon société) et CSV. Onglet « Rapports » intégré à la section Ventes du sidebar.
- Nouveaux artefacts : src/app/api/reports/sales/route.ts, src/components/reports-view.tsx, buildSalesReportPDF (pdf.ts), types SalesReport (types.ts).

---
Task ID: 6-fondations
Agent: Z.ai Code (principal)
Task: Fondations du lot 6 (14 fonctionnalités) — schéma, migration, types, contrats API.

Work Log:
- Schéma Prisma étendu + db:push OK : `Payment` (versements multiples), `Supplier` (fournisseurs), `StockMovement` (journal de stock), `AuditLog` (audit), `Client.creditLimit`, `Purchase.supplierId`, `InvoiceItem.purchasePrice` (snapshot marge).
- `prisma/backfill.ts` exécuté : 5 versements initiaux créés depuis amountPaid, 28 lignes de facture enrichies du prix d'achat.
- `src/lib/types.ts` : Payment, Supplier, StockMovement, AuditLogEntry, Client.creditLimit?, Purchase.supplierId?, Invoice.payments?, InvoiceItem.purchasePrice?, SalesReportSummary.{margin,marginPct,prevTotalTTC,prevCount}, SalesReport.monthly[].margin, byCategory[].margin, topProducts[].margin, DashboardStats.prevYearRevenue.
- `src/lib/constants.ts` : PAYMENT_METHOD_LABELS, MOVEMENT_TYPE_LABELS, AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS.
- `src/lib/audit.ts` : helper logAudit(request, action, entity, entityId, details) — ne lève jamais.
- `src/lib/pdf.ts` : buildDeliveryNotePDF, buildVatReportPDF, buildRestockOrderPDF ajoutés ; buildSalesReportPDF enrichi (ligne Marge brute/% en colSpan, colonnes Marge catégories + top produits avec pied TOTAL).

## CONTRATS API À RESPECTER (implémentés par les tâches backend ci-dessous)
1. `GET|POST /api/invoices/[id]/payments` — GET → Payment[] ; POST {amount, method, paidAt?, note?} → {payment, invoice} (recalcule amountPaid + paymentStatus).
2. `DELETE /api/payments/[id]` → {invoice} (recalcule amountPaid + paymentStatus).
3. `GET /api/suppliers?q=` → (Supplier & {purchaseCount, purchaseTotal})[] ; `POST /api/suppliers` {name, phone?, email?, address?, notes?} (name unique) ; `PUT|DELETE /api/suppliers/[id]` (DELETE bloqué si achats liés).
4. `GET /api/purchases?supplierId=` → filtre par fournisseur (ajout au filtre existant).
5. `GET /api/stock-movements?productId=&type=&take=200` → (StockMovement & {productName})[] desc ; `POST /api/stock-movements` {productId, newStock, reason} → AJUSTEMENT.
6. `GET /api/audit?action=&q=&take=200` → AuditLogEntry[] (ADMIN uniquement, 403 sinon).
7. `GET /api/admin/backup` (ADMIN) → JSON téléchargeable {version, exportedAt, counts, data:{clients,products,categories,invoices(+items+payments),purchases(+items),orders(+items),tenants(+rents),suppliers,settings,users}} ; `POST /api/admin/restore` (ADMIN) body=ce JSON → purge + recréation transactionnelle → {restored:{...counts}}.
8. `POST /api/invoices` : snapshot `purchasePrice` sur chaque item (depuis Product), crée les StockMovement SORTIE (refType VENTE), logAudit CREATE. `PATCH/PUT` facture → logAudit UPDATE ; `DELETE` → logAudit DELETE. Les routes paient/stock ne doivent PAS loguer en double.
9. `POST /api/purchases` accepte `supplierId` (optionnel) + crée StockMovement ENTREE (refType ACHAT) + logAudit. DELETE achat → mouvement inverse implicite non requis + logAudit.
10. `POST /api/products` (stock initial → StockMovement ENTREE refType INITIAL si stock>0) ; PUT product avec stock modifié → StockMovement AJUSTEMENT + logAudit ; DELETE → logAudit.
11. `POST/PUT /api/clients` accepte `creditLimit` (≥0) + logAudit. PUT renvoie le client.
12. `GET /api/reports/sales` ajoute : summary.margin (somme item.total − item.quantity×(item.purchasePrice ?? product.purchasePrice actuel)), summary.marginPct (margin/totalTTC×100, 1 décimale), summary.prevTotalTTC & prevCount (période décalée d'un an), monthly[].margin, byCategory[].margin, topProducts[].margin.
13. `GET /api/dashboard?year=` ajoute prevYearRevenue (somme totalTTC VENTE de l'année year-1).

---
Task ID: 6-b
Agent: Z.ai Code (sous-agent backend)
Task: Backend du lot 6 — journal d'audit (lecture ADMIN), sauvegarde/restauration complète (ADMIN), marges & comparaison N-1 (rapports de ventes, dashboard).

Work Log:
- Créé `GET /api/audit` (réservé ADMIN, 403 « Accès réservé à l'administrateur » sinon) : AuditLogEntry[] orderBy createdAt desc ; `take` défaut 200, clamp max 500 ; filtre `action` (CREATE|UPDATE|DELETE uniquement si valide) ; filtre `q` en OR contains sur userName/entity/details.
- Créé `GET /api/admin/backup` (ADMIN) : export JSON {version:1, exportedAt ISO, app:"ETS LAMP FALL — Sauvegarde", counts précalculés, data:{clients, categories, products, invoices(+items+payments), purchases(+items), orders(+items), tenants(+rents), suppliers, settings, users}} ; users via select SANS password ; headers `Content-Disposition: attachment; filename="sauvegarde-lampfall-AAAA-MM-JJ.json"` + `Content-Type: application/json`.
- Créé `POST /api/admin/restore` (ADMIN) : body = JSON du backup, `data` objet exigé sinon 400 « Fichier de sauvegarde invalide » (JSON malformé inclus) ; sanitize défensif par liste de champs connus par table (protège des champs obsolètes d'anciennes sauvegardes) ; `$transaction` : deleteMany dans l'ordre des dépendances FK (payment, invoiceItem, invoice, purchaseItem, purchase, orderItem, order, rent, tenant, stockMovement, auditLog, supplier, product, category, client, setting) puis createMany (clients, categories, products, suppliers, purchases→purchaseItems, invoices→invoiceItems→payments, orders→orderItems, tenants→rents, settings recréés seulement si non vides) ; IDs d'origine conservés ; items/payments/rents extraits des parents imbriqués du backup ; table users volontairement NON restaurée → réponse {restored:{…counts…}, note:"Comptes utilisateurs conservés"}.
- Modifié `GET /api/reports/sales` : Map<productId, purchasePrice> du catalogue ; marge par article = item.total − item.quantity × (item.purchasePrice snapshot ?? prix catalogue courant, 0 si inconnu) ; summary.margin (arrondi) + summary.marginPct (1 décimale) ; summary.prevTotalTTC/prevCount via une requête VENTE sur from/to décalés d'un an (`${Number(from.slice(0,4))-1}${from.slice(4)}`) ; prevFrom/prevTo en tête de réponse ; monthly[].margin, byCategory[].margin, topProducts[].margin (calculée avant le slice).
- Modifié `GET /api/dashboard` : prevYearRevenue via `db.invoice.aggregate({_sum:{totalTTC}})` VENTE sur [Date.UTC(year-1,0,1), Date.UTC(year,0,1)) — ajouté au Promise.all existant et au NextResponse.json.
- Infra : le worker next dev (démarré 22:58) avait chargé le client Prisma AVANT le db:push/generate des fondations (23:59) → 500 sur toutes les routes utilisant les nouveaux modèles (auditLog/supplier/stockMovement/payment undefined). Application du nouveau client au serveur en marche via modification inerte de `next.config.ts` (auto-restart « Found a change in next.config.ts ») — routes des autres agents (suppliers, stock-movements) débloquées au passage ; zéro erreur dans dev.log après ce redémarrage.
- Vérifié par requêtes HTTP réelles (curl, jetons admin + employé) : audit 403 sans jeton / [] avec jeton / filtres action & q / take=600 clampé ; backup 403 sans jeton, headers exacts (filename="sauvegarde-lampfall-2026-09-21.json"), counts {clients:6, categories:11, products:24, invoices:11, invoiceItems:28, payments:5, purchases:3, purchaseItems:6, orders:3, orderItems:7, tenants:4, rents:8, suppliers:0, settings:1, users:2}, aucun champ password ; restore 400 payload invalide, 403 avec compte employé (fsow), 200 ADMIN retournant exactement les counts du backup + note, login admin revalidé après restauration (comptes intacts), IDs clients conservés, paramètres société restaurés ; rapports sales margin=736 500 / marginPct=29.6 / prev 2025 = 0 facture (contrôle croisé : somme des marges snapshot identique) ; dashboard prevYearRevenue=0 (données démo 2026 uniquement), totaux inchangés (CA 2 489 210, encaissé 1 523 970).

Stage Summary:
- Contrats 6, 7, 12 et 13 implémentés et vérifiés : consultation du journal d'audit (ADMIN, filtres), sauvegarde JSON téléchargeable complète (sans mots de passe) et restauration transactionnelle (IDs conservés, comptes utilisateurs préservés), marges (globale/mensuelle/par catégorie/par produit) et comparaison N-1 dans les rapports de ventes, prevYearRevenue au dashboard.
- Fichiers : + src/app/api/audit/route.ts, + src/app/api/admin/backup/route.ts, + src/app/api/admin/restore/route.ts, ~ src/app/api/reports/sales/route.ts, ~ src/app/api/dashboard/route.ts (+ commentaire inerte dans next.config.ts pour appliquer le nouveau client Prisma au serveur dev).

---
Task ID: 6-c
Agent: Z.ai Code (sous-agent vues frontend)
Task: Vues Fournisseurs / Mouvements de stock / Journal d'audit, intégration sidebar, Réappro PDF + ajustement de stock dans Produits, répertoire fournisseurs dans Achats.

Work Log:
- `src/components/suppliers-view.tsx` (NOUVEAU) : liste GET /api/suppliers?q= via useFetch (recherche debounce useDebouncedValue), en-tête h2 « Fournisseurs » + sous-titre + recherche + bouton « Nouveau fournisseur ». Tableau : nom (+ adresse), téléphone, email, nb achats, total achats (formatMoney). Menu d'actions par fournisseur : « Achats » (dialog historique GET /api/purchases?supplierId= — numéro, date formatDate, total formatMoney, bouton pièce jointe 44px ouvrant /api/purchases/{id}/file dans un nouvel onglet si fileName, total cumulé en pied), « Modifier » (dialog partagé POST/PUT nom/téléphone/email/adresse/notes), « Supprimer » (dialog de confirmation ; erreur serveur affichée en encart rouge dans le dialog + toast destructive quand des achats sont liés, le dialog reste ouvert). Mutations via authFetch, toasts, état vide (icône Truck), skeletons, gestion d'erreurs json.error.
- `src/components/stock-movements-view.tsx` (NOUVEAU) : journal GET /api/stock-movements?type=&take=200 (useFetch), filtres pill type (Tous/Entrées/Sorties/Ajustements — style reports-view, aria-pressed) + recherche produit client-side + compteur. Tableau shadcn dans max-h-96 overflow-y-auto : Date (formatDate + heure HH:mm Intl), Produit (productName tronqué title), Type (Badge : ENTREE=emerald, SORTIE=rouge, AJUSTEMENT=ambre via MOVEMENT_TYPE_LABELS), Quantité signée (+/− coloré, AJUSTEMENT brut), Avant → Après (tabular-nums), Motif (truncate title), Réf. (mapping local {ACHAT:Achat, VENTE:Vente, MANUEL:Manuel, INITIAL:Initial}), Utilisateur (userName). Bouton Actualiser, état vide filtrée/vide, skeletons, état d'erreur.
- `src/components/audit-view.tsx` (NOUVEAU, ADMIN) : GET /api/audit?take=200 via authFetch dans useEffect + useState (useCallback, bouton Actualiser avec Loader2, 403 → message serveur + Réessayer). Filtres pill action (Tous/Création/Modification/Suppression) + recherche texte client-side (utilisateur/entité/détails). Tableau max-h-96 scroll : Date+heure, Utilisateur (userName), Action (Badge CREATE=emerald, UPDATE=ambre, DELETE=rouge via AUDIT_ACTION_LABELS), Entité (AUDIT_ENTITY_LABELS + entityId), Détails (truncate avec title). État vide + skeletons.
- `src/components/app-shell.tsx` (MODIFIÉ) : ViewId + « fournisseurs »/« mouvements »/« audit » ; NAV : Fournisseurs (Truck) juste après Achats, Mouvements de stock (ArrowLeftRight) après Produits — section « Achats & stock » — et Journal d'audit (History, adminOnly) entre Utilisateurs et Paramètres ; imports des 3 vues ; rendus main : fournisseurs/mouvements libres, audit gated isAdmin ? <AuditView /> : <RestrictedCard />.
- `src/components/products-view.tsx` (MODIFIÉ, code existant conservé) : bouton « Réappro (PDF) » (outline, FileDown) dans l'en-tête → filtre stock<=minStock, toast info si aucun, sinon buildRestockOrderPDF + downloadPDF(`Bon-reappro-AAAAMMJJ.pdf`) (imports @/lib/pdf) ; action « Ajuster le stock » (SlidersHorizontal) dans le menu d'actions → dialog (nom produit + référence, stock actuel disabled avec unité, nouveau stock number défaut = stock, motif « Inventaire, casse, correction… », aperçu Différence ±) → POST authFetch /api/stock-movements {productId, newStock, reason} → toast succès + refetch produits ; erreurs 400/404 avec message serveur ; validation entier ≥ 0.
- `src/components/purchases-view.tsx` (MODIFIÉ, code existant conservé) : FormState.supplierId ; champ « Fournisseur (répertoire) » = Select shadcn (GET /api/suppliers via useFetch) avec option « — Fournisseur libre — » (sentinelle "free", jamais de value="" Radix) ; à la sélection, pré-remplit le champ texte fournisseur existant (renommé « Fournisseur (nom libre) * » avec aide « lié au répertoire ») ; FormData inclut supplierId si sélectionné ; bouton « + Nouveau » → mini-dialog (nom, téléphone) → POST authFetch /api/suppliers → refetchSuppliers + présélection (supplierId + nom) ; toasts + erreurs serveur.
- Correctif TS au passage (fichier autorisé uniquement) : type local PurchaseRow = Purchase & { fileStored?: string | null } dans purchases-view pour lever les erreurs TS2339 préexistantes sur p.fileStored (le champ est bien renvoyé par l'API), sans toucher types.ts.
- Style : cohérence invoices/clients (h2 + sous-titre + boutons à droite), badges pastel cohérents avec status-badges, cibles tactiles ≥ 44px (boutons mobiles min-h-11, lien pièce jointe h-11), grid/tableaux existants conservés, textes français avec &apos; échappés (règle react/no-unescaped-entities).
- Vérification : tsc --noEmit filtré sur les 6 fichiers = 0 erreur (aucune régression) ; dev.log : /api/audit répond 200 (route backend 6-b en place), aucune erreur compile/runtime sur les vues. Lint volontairement non lancé (agents parallèles) conformément aux consignes.

Stage Summary:
- Trois nouvelles vues livrées : Fournisseurs (CRUD + historique d'achats avec pièces jointes + erreurs serveur), Mouvements de stock (journal filtrable type/recherche avec badges colorés et traçabilité Avant→Après), Journal d'audit (admin, filtres action + recherche, badges Création/Modification/Suppression).
- Produits : bon de réapprovisionnement PDF des produits sous seuil + ajustement direct du stock (mouvement AJUSTEMENT motifé).
- Achats : sélection du fournisseur depuis le répertoire (avec création rapide) et liaison supplierId à la soumission.
- Sidebar : Fournisseurs et Mouvements dans « Achats & stock », Journal d'audit (admin) dans « Administration ».
- Fichiers créés : src/components/suppliers-view.tsx, src/components/stock-movements-view.tsx, src/components/audit-view.tsx. Fichiers modifiés : src/components/app-shell.tsx, src/components/products-view.tsx, src/components/purchases-view.tsx.

---
Task ID: 6-a
Agent: Z.ai Code (sous-agent backend)
Task: Lot 6 — backend versements, fournisseurs, journal de stock + instrumentation audit/mouvements des routes existantes (contrats API n° 1, 2, 3, 4, 5, 8, 9, 10, 11 des fondations 6-fondations).

Work Log:
- NOUVEAU `src/app/api/invoices/[id]/payments/route.ts` : GET → Payment[] de la facture triés par paidAt desc (404 si facture inconnue) ; POST {amount, method, paidAt?, note?} → 400 si montant ≤ 0 ou > reste à payer (message clair avec montant formaté), méthode validée contre PAYMENT_METHOD_LABELS (défaut ESPECES), transaction : création du Payment puis recalcul invoice.amountPaid = somme des versements plafonnée à totalTTC et paymentStatus (PAYE si ≥ totalTTC, PARTIEL si > 0, sinon NON_PAYE) → retour {payment, invoice} 201. Pas de logAudit (contrat n° 8 : pas de double log).
- NOUVEAU `src/app/api/payments/[id]/route.ts` : DELETE en transaction (find payment → delete → recalcul amountPaid/paymentStatus de la facture liée avec la même règle) → retour {invoice} ; 404 « Versement introuvable » sinon.
- NOUVEAU `src/app/api/suppliers/route.ts` : GET ?q= (name contains) trié par name, incluant purchaseCount (via include _count) et purchaseTotal (groupBy Purchase par supplierId, _sum.total — _sum n'étant pas disponible sur relation dans findMany) ; POST {name, phone?, email?, address?, notes?} → 400 si nom vide ou déjà pris (findFirst) ; logAudit CREATE « Supplier ».
- NOUVEAU `src/app/api/suppliers/[id]/route.ts` : PUT avec mêmes champs + contrôles (404 introuvable, 400 nom vide/doublon hors soi-même) + logAudit UPDATE ; DELETE → 400 « Impossible : X achat(s) lié(s) à ce fournisseur » si purchases.count > 0, sinon delete + logAudit DELETE.
- NOUVEAU `src/app/api/stock-movements/route.ts` : GET ?productId=&type=(ENTREE|SORTIE|AJUSTEMENT)&take= (défaut 200, max 1000) → mouvements orderBy createdAt desc avec productName (include product select name, aplati) ; POST {productId, newStock, reason} → 404 produit inconnu, 400 « Le nouveau stock est identique à l'actuel » si inchangé, transaction : update product.stock=max(0, round(newStock)) + création StockMovement AJUSTEMENT (quantity=|diff|, stockBefore/stockAfter, refType MANUEL, userName via getAuthUser) → retour {movement, product} 201.
- MODIFIÉ `src/app/api/invoices/route.ts` (POST) : lecture des produits AVANT création/décrément (map productId → purchasePrice+stock), snapshot `purchasePrice` sur chaque InvoiceItem avec productId (null pour les articles libres), StockMovement SORTIE par item dans la même transaction (quantity=round(qty), stockBefore avant, stockAfter=max(0, stock−qty), refType VENTE, refId=created.id, reason null, userName via getAuthUser), puis APRÈS la transaction logAudit CREATE « Invoice » « {number} — {clientName} — {totalTTC} FCFA ». Les proformas et updateStock=false ne génèrent ni décrément ni mouvement.
- MODIFIÉ `src/app/api/invoices/[id]/route.ts` : PUT → logAudit UPDATE « Invoice » (number) après succès ; DELETE → _request renommé request, logAudit DELETE « Invoice » (number capturé via existing) après succès.
- MODIFIÉ `src/app/api/purchases/route.ts` : GET accepte ?supplierId= (where supplierId, combinable avec q) ; POST lit supplierId du FormData (optionnel) → 400 « Fournisseur invalide » si inconnu, déduit supplier = linked.name si le champ supplier est vide ; données créées avec supplierId ; dans la transaction (si updateStock) : StockMovement ENTREE par item avec productId (quantity, stockBefore avant incrément, stockAfter après, refType ACHAT, refId achat, userName) ; logAudit CREATE « Purchase » « {number} — {supplier} — {total} FCFA » après succès.
- MODIFIÉ `src/app/api/purchases/[id]/route.ts` : DELETE → _request renommé request, logAudit DELETE « Purchase » (existing.number) après suppression.
- MODIFIÉ `src/app/api/products/route.ts` (POST) : stock initial calculé une fois (max 0), transaction création produit + StockMovement ENTREE INITIAL (quantity=stock, stockBefore 0, stockAfter stock, reason « Stock initial ») si stock > 0 ; logAudit CREATE « Product » (nom).
- MODIFIÉ `src/app/api/products/[id]/route.ts` : PUT lit le produit existant (404 sinon), compare ancien/nouveau stock → StockMovement AJUSTEMENT (quantity=|diff|, refType MANUEL, reason « Modification fiche produit », userName) dans la transaction d'update ; logAudit UPDATE « Product » (nom) ; DELETE → 404 si introuvable, logAudit DELETE « Product » (nom capturé avant suppression).
- MODIFIÉ `src/app/api/clients/route.ts` + `src/app/api/clients/[id]/route.ts` : champ creditLimit accepté en POST/PUT (Math.max(0, Number||0), défaut 0) ; logAudit CREATE/UPDATE « Client » (nom) ; DELETE → 404 si introuvable + logAudit DELETE « Client » (nom capturé avant).
- Conventions respectées : import { db } from "@/lib/db", logAudit (ne lève jamais), getAuthUser, NextRequest/NextResponse, try/catch avec console.error("VERBE /chemin", error) + 500 « Erreur serveur », paramètres dynamiques { params: Promise<{ id: string }> } (style Next.js 16 des routes existantes). Ni lint ni tsc lancés (consigne) — code TypeScript strict et typé.
- dev.log consulté : aucune erreur runtime (uniquement GET / 200).

Stage Summary:
- Contrats API n° 1, 2, 3, 4, 5, 8, 9, 10 et 11 implémentés : versements multiples (POST/GET/DELETE avec recalcul automatique amountPaid/paymentStatus), CRUD fournisseurs avec stats d'achats et suppression protégée, journal des mouvements de stock (consultation + ajustement manuel), snapshot purchasePrice + mouvements SORTIE VENTE + audit sur création de facture, audit sur UPDATE/DELETE facture, mouvements ENTREE ACHAT + supplierId + audit sur achats, mouvement INITIAL + audit produits, AJUSTEMENT sur modification de stock fiche produit, creditLimit + audit clients.
- Prêt pour les agents frontend (6-b/6-c…) : aucune modification hors du périmètre, schéma Prisma et helpers (audit/auth/db) inchangés.

---
Task ID: 6-d
Agent: Z.ai Code (sous-agent frontend)
Task: Frontend du lot 6 — partage/relance client, versements multiples, plafond de crédit, sauvegarde/restauration, deltas dashboard & rapports, marges, état TVA PDF.

Work Log:
- Créé `src/components/invoice-share-dialog.tsx` : dialog { invoice, mode: "relance" | "envoi", open, onOpenChange }. Message par défaut éditable (templates exacts demandés : relance « …présente un reste à payer de X FCFA… », envoi « …Reste à payer : X FCFA… »), client = clientName || "Client comptoir", dateFr = formatDate, ttc = formatMoney, reste formaté FR + « FCFA », société depuis useSettingsStore (repli « ETS LAMP FALL »). Résumé facture/client/reste en 3 mini-cartes. Actions : WhatsApp (normalisation téléphone → chiffres seuls, retrait préfixe 00, gestion « 0 » national 9–10 chiffres et local 9 chiffres sans 221 → préfixe 221 ; wa.me + encodeURIComponent ; désactivé + Tooltip « Aucun numéro de téléphone » sinon), Email (mailto avec subject « Facture {num} » + body encodé ; désactivé + Tooltip sans email — email récupéré via /api/clients car non snapshot sur la facture), « Copier le message » (clipboard + toast). Bouton secondaire « Télécharger le PDF » (saveOrOpenInvoicePDF download). Titre avec icône Bell (« Relancer le client ») ou Send (« Envoyer la facture »).
- Créé `src/components/payments-dialog.tsx` : dialog { invoice, open, onOpenChange, onUpdated }. GET authFetch /api/invoices/[id]/payments à l'ouverture, historique scrollable (max-h-64) : date formatDate, méthode PAYMENT_METHOD_LABELS, montant formatMoney bold, note, suppression (DELETE authFetch /api/payments/[id] → refresh + onUpdated + toast, spinner sur la ligne). En-tête 4 mini-cartes : N° facture, Total TTC, Déjà payé, Reste (synchronisé avec les {invoice} renvoyés par POST/DELETE). Formulaire d'ajout : Montant (défaut = reste), Méthode (Select shadcn, défaut ESPECES), Date (input date, défaut AAAA-MM-JJ local via helper todayISO sans décalage UTC), Note → POST {amount, method, paidAt, note} → refresh + onUpdated + toast ; erreurs serveur en toast destructive.
- Modifié `src/components/invoices-view.tsx` : menu d'actions VENTE enrichi (Paiements → PaymentsDialog, Relancer visible si paymentStatus ≠ PAYE → ShareDialog mode relance, Envoyer par… → mode envoi, Bon de livraison → buildDeliveryNotePDF + openPDF aperçu) ; menu PROFORMA inchangé ; états shareInvoice/shareMode/paymentsInvoice, les deux dialogs rendus, onUpdated des paiements → refetch de la liste. Tout le comportement existant conservé.
- Modifié `src/components/clients-view.tsx` : champ « Plafond de crédit (FCFA) » (Input number, défaut 0, description « 0 = aucun plafond ») dans le dialog création/édition, envoyé en POST/PUT comme nombre ≥ 0 ; badge discret doré « Plafond : X » (formatMoney) dans la liste quand creditLimit > 0.
- Modifié `src/components/client-detail-view.tsx` : encours = Σ (totalTTC − amountPaid) des ventes non soldées ; carte « Plafond de crédit » quand creditLimit > 0 avec Progress shadcn (indicator rouge via data-slot si dépassement), texte « Plafond dépassé ! » ou « Encours : X / plafond Y ». Stats enrichies : Panier moyen (CA ventes / nb), Fréquence d'achat (Δ moyen en jours entre ventes triées, « ≈ N jours »), Dernier achat (« il y a N jours » / « Aujourd'hui ») + carte Encours — grille passée à 8 cartes.
- Modifié `src/components/settings-view.tsx` : Card « Sauvegarde & restauration » (admin) — « Exporter la sauvegarde » (authFetch /api/admin/backup → blob → téléchargement sauvegarde-lampfall-AAAA-MM-JJ.json + toast) ; « Restaurer… » (outline destructive, input file .json caché, lecture file.text() + JSON.parse avec garde « data ») → Dialog de confirmation sévère (« Toutes les données actuelles seront remplacées… irréversible », bouton « Remplacer les données ») → POST authFetch /api/admin/restore → toast succès listant les counts retournés (restored, labels FR) ; gestion 403/400/JSON invalide ; rechargement des paramètres + invalidateCompanyCache après restauration.
- Modifié `src/components/dashboard-view.tsx` : Badge outline doré (border-gold/60, bg-gold-soft/50) sous le titre du bandeau — delta = prevYearRevenue > 0 ? ((revenueTotal − prevYearRevenue)/prevYearRevenue×100) : null ; icônes TrendingUp/Down, signes +/−, 1 décimale virgule FR, « vs {year−1} : — » si année précédente vide, title avec les deux CA.
- Modifié `src/components/reports-view.tsx` : bouton « État TVA (PDF) » (FileText, outline, désactivé si count = 0) → buildVatReportPDF(report, periodLabel) + downloadPDF Etat-TVA-{from}_{to}.pdf + toast ; KPI « CA TTC » avec footer delta « vs période précédente : ±X % » (vert/rouge, prevTotalTTC) via nouvelle prop footer de KpiCard ; mini-indicateurs passés à 10 cases (sm:grid-cols-5) avec « Marge brute » (formatMoneyCompact) et « Marge % » (virgule FR) ; Top produits : colonne « Marge » (formatMoney) après Total ; Ventes par catégorie : HBar enrichi d'une prop title (tooltip « {display} · marge {formatMoney(margin)} », affichage inchangé).
- Style : 'use client' partout, toasts/shadcn existants, min-h-11 sur les actions principales, tooltips Radix, responsive sm:, authFetch sur tous les appels admin/paiements.

Stage Summary:
- Frontend du lot 6 livré : relance & envoi de factures (WhatsApp/email/copie/PDF), gestion fine des versements multiples (historique, ajout, suppression, statuts recalculés), plafond de crédit avec encours et alerte de dépassement, sauvegarde/restauration JSON admin, delta CA vs N−1 au dashboard, état TVA PDF + marges (brute, %, par produit, par catégorie) dans les rapports.
- Contrats API respectés (voir Task ID: 6-fondations, points 1, 2, 7, 11, 12, 13). Aucune route créée côté frontend ; en attente des backends parallèles pour /api/payments, /api/admin/*, creditLimit, prevYearRevenue, marges.
- Fichiers créés : src/components/invoice-share-dialog.tsx, src/components/payments-dialog.tsx. Fichiers modifiés : src/components/invoices-view.tsx, src/components/clients-view.tsx, src/components/client-detail-view.tsx, src/components/settings-view.tsx, src/components/dashboard-view.tsx, src/components/reports-view.tsx.
- Lint/tsc non lancés (consigne : agents parallèles) ; compile dev vérifiée (page `/` 200, aucune erreur liée aux fichiers modifiés).

---
Task ID: 6-integration
Agent: Z.ai Code (principal)
Task: Intégration finale du lot 6 — lint, vérification end-to-end, nettoyage.

Work Log:
- Sous-agents 6-a (paiements/fournisseurs/stock/audit), 6-b (backup/restore/audit API/marges/N-1), 6-c (vues Fournisseurs/Mouvements/Audit + nav + ajustement stock + réappro + fournisseur achats), 6-d (relances WhatsApp/email, paiements, BL, plafond, stats client, sauvegarde, badges N-1, TVA) livrés.
- Lint final : 0 erreur, 0 warning (1 directive eslint-disable inutilisée auto-corrigée).
- Vérifié par curl : POST /api/invoices crée le mouvement SORTIE (150→145, userName "Administrateur") + snapshot purchasePrice (700) + audit ; versement Wave 2 000 → statut PARTIEL ; audit journalisé (CREATE Invoice/Supplier) ; backup JSON complet (users sans password) ; marge rapport 738 000 FCFA / 29,6 % (contrôle croisé OK) ; prevYearRevenue 2025 = 0.
- Vérifié via agent-browser : vue Fournisseurs (table + stats), Mouvements (filtres pill, badges colorés, avant→après), Audit (filtres + badges Création/Modification/Suppression), dialog Paiements (historique, ajout 3 900 Espèces → facture passée Payé, toast, liste rafraîchie), dialog Relancer (message pré-rédigé éditable, boutons WhatsApp vert/Email/Copier/PDF), Bon de livraison PDF (aperçu visuel : en-tête société, client, articles SANS prix, total articles, zones de signature), badge dashboard « vs 2025 : — », rapports (État TVA PDF validé par extraction texte : Base HT/TVA/TTC mensuels, Marge brute 738 k + 29,6 % en mini-stats, bouton Réappro PDF validé « Bon-reappro-2026-09-21.pdf »), ajustement stock 145→150 motif « Inventaire physique » → mouvement AJUSTEMENT dans le journal, plafond crédit client 100 000 → badge liste + carte Plafond avec barre de progression + stats enrichies (panier moyen, fréquence, dernier achat il y a 18 jours, encours), export sauvegarde JSON 65 Ko validé (counts complets), mobile 390 px (drawer avec nouveaux onglets, scrollWidth 390).
- Nettoyage : facture de test FV-2026-0008 « Test Audit » supprimée via API (trace DELETE dans l'audit — preuve supplémentaire du journal).
- Commit git du lot.

Stage Summary:
- Les 14 fonctionnalités du lot sont livrées et vérifiées de bout en bout : relances & envoi WhatsApp/email, marges (rapport UI+PDF), état TVA PDF, bons de livraison, versements multiples avec historique, répertoire fournisseurs avec historique d'achats, journal de stock (ventes/achats/ajustements/initial), bon de réappro PDF, plafond de crédit avec alerte, stats client enrichies, sauvegarde/restauration JSON, journal d'audit admin, comparaison N-1 (dashboard + rapports).
- Nouveaux artefacts : modèles Payment/Supplier/StockMovement/AuditLog (+creditLimit/supplierId/purchasePrice), 8 nouvelles routes API, 5 nouveaux composants, 3 nouveaux PDF, prisma/backfill.ts.

---
Task ID: 6
Agent: Z.ai Code (orchestrateur)
Task: Synchronisation GitHub + préparation déploiement Coolify (adaptation du Dockerfile QRBag, sans modifier le projet)

Work Log:
- Diagnostic git : 149 fichiers signalés « modifiés » = 0 insertion / 0 suppression → uniquement des changements de permissions (100644→100755) dus à la restauration du sandbox ; corrigé via `git config core.fileMode false` (config locale uniquement, aucun fichier projet modifié). GitHub était déjà à jour (aucun commit en avance).
- Analyse du projet pour le Docker : `next.config.ts` a déjà `output: "standalone"` (le build copie `.next/static` + `public` dans standalone via le script build) ; auth maison avec `AUTH_SECRET` fallback intégré (aucune variable d'environnement obligatoire) ; `db/` et `upload/` ignorés par git → base vierge au premier démarrage ; `prisma/seed-v3.ts` idempotent (paramètres société + admin/admin123).
- Constat : les pièces jointes d'achats sont stockées dans `db/uploads` (process.cwd()) → documenté dans les notes de volumes Coolify.
- Écrit du `Dockerfile` à la racine, adapté du modèle QRBag avec 4 seules modifications : titre (ETS LAMP FALL), URL de clone (topmuch/Lampfall.git), nom de la base SQLite (/app/data/lampfall.db), création admin via `bun prisma/seed-v3.ts` (équivalent idempotent de create-admin.cjs).

Stage Summary:
- GitHub `topmuch/Lampfall` synchronisé avec la version locale (tête 4093b74 puis commit Dockerfile).
- `Dockerfile` Coolify prêt à la racine : clone du dépôt → bun install → prisma generate → bun run build (standalone) → au démarrage : prisma db push + seed admin/admin123 + node .next/standalone/server.js sur 0.0.0.0:3000.
- Volume persistant requis : /app/data (base SQLite). Optionnel : /app/db (pièces jointes des achats).

---
Task ID: 7
Agent: Z.ai Code (orchestrateur)
Task: Harmonisation de la couleur du logo (vert → violet thème du site)

Work Log:
- Palette du site identifiée : primaire oklch(0.46 0.19 296) (clair) / oklch(0.72 0.17 296) (sombre) → conversion sRGB = #6533b3, teinte HSL 263,4°.
- Recolorage pixel (Python/PIL/NumPy) : sélection des pixels verts (teinte 60-200°, sat > 0,06) des deux PNG, décalage de teinte vers 263,4° avec préservation des variations (deux tons : gouttes extérieures violet profond, goutte centrale violet moyen, trait sous-titre violet) ; texte noir, maison blanche et alpha intacts. Fichiers : public/logo.png, public/logo_small.png (+ copie public/logo-violet.png).
- Debug approfondi du cache : le navigateur test continuait d'afficher l'ancien logo vert — identifié comme le cache HTTP Chromium des réponses /_next/image (Vary: Accept, entrées créées avant recolorage) ; le serveur et curl servaient déjà du violet. Solution robuste : nouveau nom d'actif /logo-violet.png + mise à jour des 6 références (login-view ×2, app-shell, settings-view, layout favicon, pdf.ts fallback) pour casser tous les caches (navigateurs des utilisateurs et futur déploiement Coolify).
- Incident connexe traité : table User vide après la restauration sandbox du matin → seed-v3 rejoué (idempotent), login admin/admin123 OK. Base métier vide (0 factures/clients/produits) — données de test perdues à la restauration, indépendant du logo.
- Vérifié via agent-browser : page de login (logo violet), dashboard clair (logo violet sidebar), mode sombre (contraste parfait sur carte blanche). Lint : 0 erreur.

Stage Summary:
- Logo ETS LAMP FALL désormais violet (harmonisé au thème luxe violet), design strictement inchangé.
- Nouveau fichier public/logo-violet.png référencé partout (app + favicon + PDF) ; logo.png et logo_small.png également recolorés par cohérence.
- Pour les déploiements : si un logo personnalisé est uploadé dans Paramètres, il prime sur le logo par défaut (comportement inchangé).

---
Task ID: 8
Agent: Z.ai Code (orchestrateur)
Task: Correction — harmoniser le SITE avec le logo (site vert, logo vert conservé ; annule l'inversion précédente)

Work Log:
- Mal entenda la demande Task 7 : le logo est revenu à sa version verte d'origine (git checkout 9861348 -- public/logo.png public/logo_small.png ; suppression de logo-violet.png) et NOUVEAU nom d'actif public/logo-green.png (anti-cache) référencé aux 6 endroits (login ×2, app-shell, settings-view, favicon, pdf.ts).
- Couleurs extraites du logo : vert foncé #006030 = oklch(0.429 0.111 152.8), vert moyen #509058 = oklch(0.595 0.107 146.9).
- globals.css entièrement converti violet→vert : --primary clair oklch(0.43 0.11 153) / sombre oklch(0.72 0.13 153) (teinte 153 = celle du logo), fond/cards/sidebar/borders/muted/accent/ring repassés sur teintes 153-155, chromas réduits (le vert sature moins que le violet), scrollbars, text-luxe-gradient, luxe-banner, card-luxe, theme-toggle-luxe, shadow-luxe ; accents OR conservés (identité « luxe vert & or ») ; graphiques : chart-1 vert, autres teintes distinctes conservées.
- Composants : KPI tone « violet » renommé « green » (dashboard-view + reports-view, ton, union de type et 3 usages tone=), barres de plafond crédit violet-300..600 → green-400..700, dégradés graphiques violet/purple/fuchsia → green/emerald/teal, avatars (app-shell, users-view) → green/emerald. 0 occurrence violet/purple/fuchsia restante hors lib shadcn.
- Debug : le serveur servait un chunk CSS Turbopack périmé malgré les redémarrages → résolu par rm -rf .next + restart (recompilation complète).
- Vérifié via agent-browser : login (bannière verte, bouton vert, logo vert), dashboard clair (sidebar vert profond, titres dégradé vert→or), mode sombre (fond et cartes verdâtres, contraste OK). Lint 0 erreur.

Stage Summary:
- Le site est désormais entièrement harmonisé au logo VERT d'origine (clair ET sombre), accents dorés conservés.
- Anti-cache par nouveau nom d'actif (logo-green.png) ; l'ancien /logo.png (vert) reste dans public/ pour tout usage externe.
- Note infra : cache Turbopack persistant dans .next peut servir du CSS périmé après édition massive de globals.css → rm -rf .next si besoin.

---
Task ID: 9
Agent: Z.ai Code (orchestrateur)
Task: Refonte de la page de connexion — design plus engageant (thème luxe vert & or conservé)

Work Log:
- login-view.tsx entièrement réécrit (mêmes props settings/onSuccess, aucune modification app-shell/page) :
  * Fond immersif animé : 3 aurores flottantes vert/or (blur-3xl) + grille subtile masquée en radial.
  * Carte centrale en verre (bg-card/85 + backdrop-blur-xl, rounded-3xl, shadow-luxe) en split-screen lg.
  * Panneau marque gauche : bannière luxe-banner, logo en badge blanc avec halo doré pulsant, gouttes flottantes (clin d'œil au logo), liste de 4 fonctionnalités avec pastilles dorées (factures PDF, stock, immobilier, rôles), bandeau bas « Facturation — Dakar, Sénégal ».
  * Formulaire : badge « Espace sécurisé », titre « Bon retour parmi nous » (dégradé), icônes dans les champs qui passent au vert au focus, bascule afficher/masquer le mot de passe (Eye/EyeOff + aria-pressed), alerte « Verr. Maj activé » (getModifierState), erreur animée AnimatePresence (role=alert), bouton dégradé btn-shine avec balayage lumineux au survol + flèche qui glisse.
  * Entrées en cascade framer-motion (stagger 0.08, ease [0.22,1,0.36,1]) ; pied de page « © année — Système de facturation sécurisé ».
  * ThemeToggle intégré en haut à droite de la page (accessible avant connexion).
- globals.css : keyframes luxe-float/luxe-float-rev/luxe-glow (+ classes .luxe-float-a/b/c, .luxe-glow, respect prefers-reduced-motion) et .btn-shine (balayage lumineux, désactivé pendant loading).
- theme-toggle.tsx : dernier vestige violet corrigé — couleur d'icône de la poignée oklch(0.4 0.12 296) → oklch(0.35 0.1 153).
- Vérifié via agent-browser (3 sessions) : rendu clair (design conforme), mot de passe affiché/masqué, erreur animée sur mauvais identifiants, connexion admin/admin123 → dashboard, mode sombre (verre foncé + or, contraste OK), viewport mobile 390×844 (entête compacte, tout lisible). Lint : 0 erreur, 0 warning. Logs serveur : aucune erreur.

Stage Summary:
- Page de connexion premium engageante : animations d'entrée en cascade, fond aurora animé, micro-interactions (œil, Verr. Maj, shine, flèche), thème vert & or cohérent clair/sombre/mobile.
- Aucun changement d'API ni de comportement d'authentification ; props inchangées.

---
Task ID: 10
Agent: Z.ai Code (orchestrateur)
Task: Impression (A4 + ticket 80mm), onglet Commerçant, transfert factures/proformas en achats à crédit, remplacement du contenu de l'onglet Immo

Work Log:
- Prisma : nouveaux modèles CreditPurchase (destination COMMERCANT|IMMO, sourceType, sourceId @unique anti-doublon, number, tier, total, amountPaid, dueDate, note) et CreditPayment (versements, cascade) ; bun run db:push OK.
- API : /api/credit-purchases (GET filtrable par destination, POST transfert depuis facture/proforma avec contrôle d'existence + 409 si déjà transférée + audit), [id] (GET/DELETE = annulation du transfert), [id]/payments (GET/POST avec incrément amountPaid), [id]/payments/[paymentId] (DELETE avec décrément) ; audit journalisé.
- Impression (src/lib/pdf.ts) :
  * printPDF(doc) : PDF dans iframe masqué + doc.autoPrint() + window.print() → boîte de dialogue navigateur, marche avec toute imprimante installée (A4). printInvoiceA4(invoice) helper.
  * Ticket 80 mm (printTicket80/printPaymentTicket80) : reçu de versement HTML @page size 80mm auto, en-tête société (loadCompanyInfo), document, client, date/heure, mode, MONTANT REÇU en grand, total/versé/reste, « Merci de votre confiance » ; imprimé via iframe srcdoc (imprimante thermique 80mm).
- UI factures & proforma (invoices-view.tsx) : menu « Imprimer (A4) » (les deux types) et « Transférer en achat à crédit » ; badge vert « Crédit » sur les documents déjà transférés (liste /api/credit-purchases en cache) ; nouveau TransferCreditDialog (choix destination Commerçant/Immobilier en cartes radio, tiers prérempli du client, échéance, note).
- UI versements (payments-dialog.tsx) : bouton « Imprimer le ticket 80 mm » (icône Receipt) sur chaque ligne de versement.
- Nouvelle vue partagée credit-purchases-view.tsx : KPI (nb, total dû, réglé, reste), recherche, table (document + type, tiers, échéance, total/réglé/reste, statut PAYE/PARTIEL/NON_PAYE), dialog versements multiples (montant/méthode/date/note, historique, suppression), annulation du transfert avec confirmation.
- Navigation (app-shell.tsx) : ViewId « commercant » ; NAV ajoute « Commerçant — Achats à crédit » (icône Store, section Achats & stock) ; onglet Immo renommé « Immo — Achats à crédit » ; ImmoView retiré du rendu (les deux onglets rendent CreditPurchasesView avec destination COMMERCANT/IMMO) ; immo-view.tsx supprimé (locataires/loyers — modules API et modèles Tenant/Rent conservés en base, vides, pour restauration éventuelle).
- Infra : le serveur dev tué/redémarré pour recharger le client Prisma ; démarrage persistant trouvé : `( setsid bun run dev </dev/null >/dev/null 2>&1 & )` (survit entre les appels shell).
- Tests (curl + agent-browser) : API transfert OK, 409 sur doublon, versement + recalc OK ; UI : login, badge Crédit, menu complet, dialog transfert (capture), registre Commerçant (76 700 dû / 20 000 réglé / reste 56 700, Partiel), versement UI 15 000 → 35 000 réglé / reste 41 700, registre Immo (PF SOCOCIM 100 300 Non payé), ticket 80 mm et Imprimer A4 cliqués sans erreur JS. Lint 0/0 ; tsc : aucune erreur dans les fichiers nouveaux/modifiés.

Stage Summary:
- Impression opérationnelle : factures/proformas en A4 via navigateur ; reçus de versement en ticket 80 mm pour imprimante thermique.
- Achats à crédit : toute facture ou proforma peut être transférée vers l'onglet Commerçant ou Immo, avec suivi des versements et du solde ; anti-doublon ; annulation possible.
- Onglet Immo : ancien contenu locataires/loyers retiré de l'affichage, remplacé par le registre des achats à crédit immobilier ; onglet Commerçant créé.

---
Task ID: 10
Agent: Z.ai Code (principal)
Task: Demande à 8 volets — facture en page plein écran, classement crédit direct à la création, badge Crédit, réorganisation sidebar, PDF facture payée dans Commerçant/Immo, fix ticket 80mm invisible, refonte dashboard (design joint version large), rapport du jour imprimable.

Work Log:
- Étendu `src/lib/types.ts` : `DashboardToday`, `DashboardStats.today/statusCounts/credit`, types `DailyReport`/`DailyPaymentRow`/`DailyCreditPaymentRow`.
- Nouvelle API `GET /api/reports/daily?date=` : factures du jour, versements (Payment), règlements crédit (CreditPayment), répartition par mode, synthèse HT/TVA/TTC.
- Étendu `GET /api/dashboard` : stats du jour (ventes, encaissements, compteurs), répartition statuts paiement (groupBy), agrégats achats à crédit.
- `src/lib/pdf.ts` : 1) FIX ticket 80mm — `printTicket80` passe de `srcdoc` à **blob URL + iframe** (même mécanique fiable que l'impression A4 qui fonctionnait) ; 2) extrait `buildPaymentTicketHTML` réutilisable (aperçu + impression) ; 3) nouveau `buildDailyReportPDF` (A4 vert/or : 4 KPI, statuts, table factures du jour, versements encaissés, règlements crédit, total encaissé du jour, répartition par mode).
- Nouveau `src/components/ticket-preview-dialog.tsx` : **aperçu visuel du ticket 80 mm** (iframe srcDoc, largeur 312px ≈ 80 mm) + bouton « Imprimer (80 mm) ». Le ticket s'affiche DÉSormais automatiquement après chaque versement enregistré (facture ET règlement crédit).
- `payments-dialog.tsx` : ouverture auto de l'aperçu ticket après enregistrement d'un versement (lecture de `json.payment`) ; bouton reçu par ligne.
- `credit-purchases-view.tsx` : badge « Crédit » doré sur chaque ligne ; bouton **Télécharger la facture PDF** (vert, icône Download) visible uniquement quand l'achat à crédit est PAYE (fetch `/api/invoices/{sourceId}` + `saveOrOpenInvoicePDF`) ; aperçu ticket 80 mm aussi dans les versements crédit (pseudo-document number/tier/total).
- Nouveau `src/components/invoice-editor.tsx` : **page plein écran** (fixed inset-0, header collant avec retour + Créer) remplaçant la modale de facture. Contient une carte « Classement du crédit » avec 3 radio-cards (Vente normale / Commerçant / Immo) + champs tiers/échéance/note ; à la création, si destination choisie → POST auto vers `/api/credit-purchases` ; info « déjà classée à crédit » en édition.
- `invoices-view.tsx` : utilise `InvoiceEditor` (page), badge enrichi « Crédit · Commerçant / Crédit · Immo » (map sourceId→destination), props `autoOpenNew`/`onAutoOpenNewConsumed` pour l'ouverture depuis le dashboard.
- `app-shell.tsx` : sidebar réorganisé en **Pilotage (Dashboard, Rapports) / Ventes (Factures, Proforma, Commandes, Clients) / Crédits (Commerçant, Immo) / Achats & stock (Achats, Fournisseurs, Produits, Mouvements) / Administration** ; câblage bouton « Nouvelle facture » du dashboard → bascule Factures + ouverture page de création.
- `dashboard-view.tsx` **entièrement réécrit** (design modèle « Admin Dashboard », version large, thème vert/or) : bandeau titre + navigation année + actions [Rapport du jour ▾ (Imprimer/PDF), Nouvelle facture] ; graphique aires recharts « Évolution des ventes » (facturé vert / encaissé or, gradients) ; **4 KPI colorées 2×2** (Ventes du jour, Encaissé du jour, Créances clients, Crédits à payer) ; table « Dernières factures » à **en-tête vert coloré** façon modèle ; **donut** « Statut des factures » avec % payées au centre ; Top clients / Revenu par catégorie en barres horizontales ; 3 grandes stats (Total clients, Produits, Achats à crédit) cliquables ; Alertes de stock en grille.
- Tests agent-browser complets (desktop 1440 + mobile 390, clair/sombre) : création facture classée Commerçant (toast + badge), versements crédit + facture avec aperçu ticket auto, paiement intégral → bouton PDF apparaît, téléchargement facture PDF OK, rapport du jour téléchargé (rendu vérifié), lint 0 erreur, dev.log 0 erreur.

Stage Summary:
- Les 8 demandes sont livrées et testées. Commit unique « Feature » à pousser (token GitHub compromis à révoquer — demander un token frais à l'utilisateur avant push).
- Points de vigilance : le statut de paiement de la facture d'origine reste indépendant des règlements crédit (architecture existante) ; `printTicket80` et `printPDF` partagent le même mécanisme blob+iframe (fiable là où l'A4 marchait) ; l'aperçu ticket garantit un affichage visible même si l'impression est bloquée par le navigateur.

---
Task ID: 11
Agent: Z.ai Code (principal)
Task: Vérification finale du lot des 8 demandes dans le navigateur + push GitHub avec le token frais fourni par l'utilisateur.

Work Log:
- Lu le worklog : Task 10 déjà terminé (les 8 demandes implémentées, testées, committées en 68280a7), seul le push restait.
- Vérifié l'état git : main 3 commits en avance, arbre propre ; serveur dev sain (API 200 dans dev.log).
- Vérification agent-browser sur http://localhost:3000 :
  - Connexion admin OK ; dashboard version large (sidebar réorganisé Pilotage/Ventes/Crédits/Achats & Stock/Administration, bouton Rapport du jour, bouton Nouvelle facture, table en-tête verte avec téléchargements PDF).
  - Nouvelle facture : page plein écran (fixed inset-0) confirmée — l'éditeur couvre la liste ; contient les 3 radio-cards Vente normale / Commerçant / Immo.
  - Factures : badges « Crédit · Commerçant » affichés.
  - Onglet Commerçant : badge « Crédit », bouton « Télécharger la facture PDF » visible uniquement pour la facture Payée (FV-2026-0002), versements + annulation de transfert présents.
  - Versements : bouton « Afficher le ticket 80 mm » ; aperçu affiché et capturé en screenshot (en-tête société, REÇU DE VERSEMENT, montant, Imprimer 80 mm) — bug f confirmé corrigé.
- Push GitHub avec le token fourni en URL de commande (jamais stocké dans la config git) : `92eba71..68280a7 main -> main`.
- ls-remote confirme : refs/heads/main = 68280a7 sur GitHub ; fetch pour rafraîchir origin/main → `## main...origin/main` synchronisé.

Stage Summary:
- Les 8 demandes sont vérifiées dans le navigateur et publiées sur GitHub (68280a7 sur origin/main).
- Le token fourni a transité en clair dans la conversation et la commande : l'utilisateur doit le RÉVOQUER sur GitHub (Settings → Developer settings → Personal access tokens) après usage, ainsi que l'ancien ghp_6MkHl… déjà signalé.
- Rien d'autre en attente côté code ; prochains travaux éventuels : nouvelles demandes utilisateur.

---
Task ID: 12
Agent: Z.ai Code (principal)
Task: Lot de 3 demandes — 1) retirer les mentions « Non livré / Non payé » de la facture PDF ; 2) afficher le statut de livraison du document source dans les onglets Commerçant/Immo ; 3) refonte page de connexion en 16:9 plein cadre ; + suppression des infos de connexion affichées sur la page de connexion (demande complémentaire).

Work Log:
- `src/lib/pdf.ts` (buildInvoicePDF) : watermark « IMPAYÉ » supprimé (seuls « PROFORMA » et « PAYÉ » subsistent) ; badges de statut affichés uniquement si positifs — « Payé / Partiel » et « Livré » — jamais « Non payé » ni « Non livré ».
- `src/app/api/credit-purchases/route.ts` (GET) : enrichit chaque achat à crédit avec `sourceDeliveryStatus` / `sourcePaymentStatus` lus dans la facture d'origine (join sur sourceId, valeurs à jour en continu).
- `src/lib/types.ts` : `CreditPurchase` étendu avec `sourceDeliveryStatus?` / `sourcePaymentStatus?`.
- `src/components/credit-purchases-view.tsx` : colonne Statut = PaymentBadge + DeliveryBadge (statut de livraison de la facture source) → ex. « Non payé · Livré ».
- `src/components/login-view.tsx` réécrite en **16:9 plein cadre** : split-screen edge-to-edge (panneau marque vert 58-60 % avec logo, nom géant, grille 2×2 de features, bandeaux haut/bas + aurores animées ; panneau formulaire 40-42 % centré, footer bas, safe-area iOS) ; **bloc « Première utilisation ? admin/admin123 » SUPPRIMÉ** (demande complémentaire) ; cascade framer-motion et toutes les fonctionnalités conservées (œil mdp, Verr. Maj, erreur animée).
- Interruption prolongée des outils (shell indisponible) : des commits automatiques UUID ont été créés par l'infrastructure pendant la panne ; fusionnés en un commit propre via `git reset --soft 68280a7` avant publication (rien n'avait été poussé).
- Tests agent-browser (1440×810 = 16:9) : page de connexion rendue plein cadre, sans identifiants, mobile 390 OK ; connexion admin → création facture FV-2026-0003 (client libre, Livré + Non payé, classement Commerçant) → badge « Crédit · Commerçant » dans Factures ; onglet Commerçant affiche « Non payé Livré » (FV-2026-0003), « Payé Non livré » (FV-2026-0002), « Partiel Non livré » (FV-2026-0001) ; PDF FV-2026-0003 téléchargé et texte extrait (pdftotext) : AUCUNE mention « Non payé / Non livré / IMPAYÉ », badge « Livré » présent, montants intacts ; lint 0 erreur.

Stage Summary:
- Les 4 demandes (3 + suppression infos de connexion) sont livrées et vérifiées de bout en bout.
- La facture PDF ne montre plus jamais de statut négatif : adaptée à l'envoi client.
- Le statut de livraison affiché dans Commerçant/Immo reste synchronisé avec la facture d'origine (join API, pas de copie figée).
- Rappel sécurité : le token GitHub fourni a circulé en clair → à révoquer après le push.

---
Task ID: 13
Agent: Z.ai Code (principal)
Task: Lot de 4 demandes — 1) simplifier l'édition de facture (page trop longue) ; 2) barre de recherche de produits dans la création de facture ; 3) création rapide de client et de produit depuis la création de facture ; 4) import de produits par Excel/CSV dans l'onglet Produits.

Work Log:
- `items-editor.tsx` réécrit : le sélecteur Select est remplacé par une **barre de recherche** (Popover + Command/cmdk, recherche par nom ou référence, affiche prix + stock + unité par produit) ; entrée « Créer un produit… » dans les résultats (avec le terme saisi présaisi) + lien discret sous le tableau ; nouveau prop `onCreateProduct`.
- `invoice-editor.tsx` refondu en **layout compact 2 colonnes** (max-w-6xl, lg:grid-cols-[1fr_360-400px]) :
  - Colonne principale = carte Articles (recherche + table) avec **totaux intégrés** en pied de carte (HT / TVA % + montant / TTC) — supprime les cartes « Totaux » et « Options & notes » séparées ;
  - Colonne latérale = Client (avec bouton « Créer ») + Paramètres (dates, livraison, paiement, montant payé conditionnel, décrémenter stock) + Classement du crédit (radio-cards compactes) + Notes ;
  - Badge « Total TTC » en direct dans le header ; rangée d'actions bas de page supprimée (header suffit) ; page ≈ 1,5 écran au lieu de 4+.
  - `QuickClientDialog` : création rapide de client (nom, téléphone, type, adresse) → POST /api/clients → ajout à la liste locale + auto-sélection (nom/tél/adresse remplis).
  - `QuickProductDialog` : création rapide de produit (désignation pré-remplie avec le terme recherché, catégorie avec repli statique PRODUCT_CATEGORIES si la base est vide, prix achat/vente, stock initial, unité) → POST /api/products → ajout au catalogue local + insertion automatique dans la facture.
- Nouveau `product-import-dialog.tsx` + bouton « Importer » dans `products-view.tsx` :
  - Parsing via **xlsx** (SheetJS) : .xlsx/.xls/.csv ; mapping souple des en-têtes (accents/casse/espaces insensibles, alias FR/EN : nom/désignation/produit, référence/ref, catégorie/famille, prix achat/vente, stock/quantité, unité, stock min/seuil) ;
  - Bouton **Modèle CSV** téléchargeable ; aperçu paginé avec statut par ligne (OK / Nom manquant / Catégorie inconnue) ; catégorie par défaut applicable aux vides/inconnues ; import séquentiel avec compteur de progression ; stock initial enregistré automatiquement comme mouvement d'entrée (comportement API) ; toast + bandeau résultat ; rafraîchit produits + catégories.
- Ajouté `xlsx` à package.json.
- Tests agent-browser (1440×900 + 390 mobile) : éditeur compact rendu ; recherche « ciment » → Ciment 50kg ajouté au prix ; client « Fatou Ndiaye Boutique » créé et auto-sélectionné ; produit « Peinture blanche 5L » créé et inséré (totaux 9 500 / 1 710 / 11 210) ; facture FV-2026-0004 créée depuis le nouvel éditeur ; import CSV de 4 produits → aperçu 4/4 valides → « 4 produit(s) créé(s) », compteur Références 2→6, produits et mouvements visibles ; mobile OK (colonnes empilées, table défilante) ; lint 0 erreur ; dev.log sans erreur.

Stage Summary:
- La création/édition de facture tient désormais sur ~1,5 écran avec recherche de produits et créations rapides intégrées — plus besoin de quitter la page pour ajouter un client ou un produit.
- L'import Excel/CSV permet d'alimenter le catalogue en masse avec validation avant import.
- Découverte utile : la table Category en base est vide (l'app utilise le repli statique) — l'import et le quick-create gèrent ce cas.
- Données de test créées pendant la vérification : client Fatou Ndiaye Boutique, facture FV-2026-0004 (11 210 FCFA), produits Robinet mélangeur / Câble électrique 2.5mm / Ampoule LED 12W / Tube PVC 100mm.

---
Task ID: 14
Agent: Z.ai Code (principal)
Task: (1) Synchroniser la version web locale avec GitHub (le sandbox avait été restauré à un état antérieur — Tasks 7-13 absentes localement) ; (2) police Times New Roman Italique sur les PDF facture et facture proforma.

Work Log:
- Diagnostic : local en avance 1 / derrière 9 sur origin/main (commit local eec9515 = doublon de contenu de 4093b74, diff 149 fichiers 0±0) ; fetch → origin à f0b995b (Tasks 7-13 incluses). `git reset --hard origin/main` → local == GitHub, arbre propre.
- `bun install` (récupère cmdk + xlsx ajoutés par f0b995b).
- pdf.ts refondu avec un système de police paramétrable : type `PdfFont { name, normal, bold }`, `DEFAULT_FONT` (helvetica normal/bold) et `INVOICE_FONT` (times italic/bolditalic) ; helpers `drawHeader`, `drawFooter`, `statusBadge`, `watermark`, `drawItemsTable` acceptent un paramètre `font` optionnel (défaut DEFAULT_FONT → les autres documents inchangés) ; styles autoTable (font, fontStyle head + colonnes 0/3) pilotés par le paramètre.
- `buildInvoicePDF` (facture VENTE + PROFORMA) : INVOICE_FONT passé à tous les helpers et appliqué aux 7 blocs setFont inline (bloc client, infos, totalRow — bold→bolditalic, montant en lettres italic, signature proforma, notes, footer). Tout le document est en Times italique ; la hiérarchie visuelle est conservée via gras italique.
- DB locale restaurée désynchronisée : users vide + tables manquantes (CreditPurchase…) → `/api/credit-purchases` et `/api/dashboard` en 500. Fix : recréation du compte admin (upsert scrypt admin/admin123, rôle ADMIN) + `bun run db:push` (schéma aligné, client régénéré) + redémarrage du dev server (setsid, le client Prisma régénéré n'est pris en compte qu'au démarrage).
- Tests agent-browser : connexion admin ; éditeur compact → recherche produits cmdk (« Cim » → option Ciment 50kg 5 000 FCFA · stock 49 + entrée « Créer un produit… ») ; création rapide produit Ciment 50kg (5 000 / stock 50) auto-insérée ; création rapide client Moussa Diop (77 123 45 67) auto-sélectionnée ; facture FV-2026-0001 créée, PDF téléchargé → analyse PyMuPDF des spans : uniquement Times-BoldItalic (ETS LAMP FALL, FACTURE, N°, FACTURER À, en-têtes tableau, Ciment 50kg, TOTAL TTC, Reste à payer) + Times-Italic (adresse, contacts, dates, montant en lettres, footer) — zéro Helvetica ; proforma PF-2026-0001 idem (FACTURE PROFORMA + filigrane PROFORMA en Times) ; non-régression : export liste factures toujours Helvetica/Helvetica-Bold ; rendu visuel de la facture (image 110 dpi) : mise en page intacte, élégante, aucune mention négative.
- Lint final : 0 erreur. dev.log : API credit-purchases/dashboard/invoices 200 après resync ; rendu `/` 200 sans erreur.

Stage Summary:
- Version web locale synchronisée exactement avec GitHub (f0b995b) — tous les livrables des Tasks 7-13 sont de retour dans le sandbox.
- Facture et proforma PDF en Times New Roman italique de bout en bout (Times-Italic / Times-BoldItalic), via un paramètre de police réutilisable — les autres documents (commandes, achats, listes, BL, quittances, rapports) restent en Helvetica par défaut.
- Environnement restauré opérationnel : admin/admin123 recréé, schéma Prisma resynchronisé, dev server stable (setsid).
- Données de test créées : produit Ciment 50kg (5 000 FCFA, stock 49 après vente), client Moussa Diop, facture FV-2026-0001 (5 900 TTC TVA 18 %), proforma PF-2026-0001.

---
Task ID: 15-c
Agent: sous-agent QR tags
Task: Module QR & étiquettes (API QRtag.net + suivi QRBags)

Work Log:
- Lu worklog.md (Tasks 10-14), types.ts (QrLookup/QrTagResult/QrBagsResult), schema.prisma (model QrLookup), conventions API (reports/daily, products), use-toast/auth-client/use-fetch, style des vues (products-view) — aucun fichier existant modifié.
- Créé src/app/api/qr/qrtag/route.ts (GET) : validation url (^https?:// sinon 400 "URL invalide"), format png|svg (défaut png), size 1..12 borné (défaut 4), transparent bool ; imageUrl construite selon la formule imposée (url encodée via encodeURIComponent) ; fetch serveur (AbortSignal.timeout 12 s, User-Agent navigateur, cache no-store) → data-URL base64 (image/png ou image/svg+xml) dans dataUrl, échec réseau NON bloquant (dataUrl null, réponse 200) ; enregistrement QrLookup (provider QRTAG, query=url, options JSON {format,size,transparent}, result JSON SANS le base64 pour ne pas alourdir la table, status OK si image récupérée sinon ERREUR) ; retour 200 { result } avec dataUrl en champ additionnel.
- Créé src/app/api/qr/qrbags/route.ts (GET) : ref trimée + normalisée en majuscules ; format invalide → 200 { result } avec validFormat=false, reachable=false, sourceUrl="", message exact imposé, formatAttendu renseigné, QrLookup en "ERREUR" ; format valide → fetch https://qrbags.com/suivi/{REF} (timeout 15 s, UA "Mozilla/5.0", redirect follow) → reachable=res.ok ; extraction du <title> (regex + décodeur d'entités HTML nommées/numériques) et d'indices textuels ("not_found"/"introuvable" → "étiquette introuvable", "étiquette", "bagage/luggage/whatsapp", "suivi") → info courte (≤200 car.) ou null ; message "Étiquette vérifiable sur la page officielle…" / "Service QRBags injoignable…" ; QrLookup (status OK si reachable sinon ERREUR) ; retour 200 { result } (sourceUrl toujours fournie si format valide).
- Créé src/app/api/qr/history/route.ts (GET) : 30 dernières QrLookup triées createdAt desc, createdAt en ISO, retour { history }.
- Créé src/components/qr-view.tsx ('use client', export default QrTagsView) : en-tête "QR & Étiquettes" + sous-titre ; Tabs shadcn (grid w-full sur mobile) — onglet "Générer un QR" (QrCode) : Input URL (défaut https://etslampfall.sn), Select format PNG/SVG, Select taille 1..12 (défaut 4), Switch "Fond transparent", bouton avec spinner Loader2 ; carte résultat : badges format/taille/transparent, image dans cadre blanc bordé (bg-white, lisible en mode sombre), src = dataUrl ?? imageUrl, URL tronquée, bouton Télécharger (href=dataUrl download="qr-code.{format}", sinon <a href={imageUrl} target="_blank">) + "Ouvrir l'URL" (ExternalLink) ; encart explicatif QRtag (gratuite, sans clé, 1 000 req/10 min, cache 3 jours) ; onglet "Suivi QRBags" (Luggage) : Input référence (placeholder HAJJ25-ABC123, auto-uppercase, font-mono) + regex client, bouton Rechercher ; carte résultat : badges Format valide/invalide (vert/rouge), Service joignable/injoignable (vert/gris), badge référence, info extraite si présente, formatAttendu rappelé si invalide, message serveur, bouton "Ouvrir la page officielle de suivi" (désactivé si sourceUrl vide) ; encart explicatif QRBags ; historique commun sous les tabs : "Recherches récentes", 30 dernières (point coloré OK vert/erreur rouge + sr-only, badge fournisseur QRTAG vert / QRBAGS or, query tronqué avec title, date relative FR via Intl — "à l'instant / il y a X min / h / j / date"), bouton Actualiser (RefreshCw, spin pendant chargement), skeletons, max-h-72 overflow-y-auto avec scrollbar fine stylée ; toasts useToast (hooks/use-toast — celui réellement câblé via ui/toaster dans layout.tsx, invoices-view l'utilise aussi) ; animations framer-motion subtiles (fade+y) sur les cartes résultat ; responsive 390 px (grilles lg:grid-cols-2 empilées, image max-w-full, truncate, aucun scroll horizontal).
- Choix : previews <img> (comme le reste du projet) avec eslint-disable-next-line @next/next/no-img-element ; validation client avant appel API pour feedback immédiat ; authFetch pour tous les appels ; réaffichage complet du résultat dans chaque onglet avec état vide illustré.

Stage Summary:
- Module QR & étiquettes complet : génération de QR codes (QRtag.net, png/svg, 12 tailles, fond transparent, téléchargement base64) et vérification d'étiquettes QRBags (format HAJJ|VOL validé, page de suivi officielle testée côté serveur, lien source fourni).
- 4 fichiers créés : src/app/api/qr/qrtag/route.ts, src/app/api/qr/qrbags/route.ts, src/app/api/qr/history/route.ts, src/components/qr-view.tsx — conventions API du projet respectées (NextRequest/NextResponse, console.error("GET /chemin"), 500 {"error":"Erreur serveur"}), types frontend de types.ts utilisés tels quels, AUCUN fichier existant modifié (câblage app-shell/navigation restant à faire par l'agent principal).
- Robustesse : échecs réseau QRtag/QRBags jamais bloquants (200 avec dataUrl null / reachable false), QrLookup renseigné à chaque appel (status OK/ERREUR), historique partagé actualisé après chaque action.

---
Task ID: 15-b
Agent: sous-agent calendrier
Task: Module calendrier (événements mensuels, types/couleurs, à venir)

Work Log:
- Lu worklog.md (Tasks 11-14) pour les conventions : API NextRequest/NextResponse avec console.error("VERBE /chemin", error) + 500 {"error": "Erreur serveur"}, routes dynamiques { params: Promise<{ id: string }> }, toasts via useToast (@/hooks/use-toast — convention réelle de invoices-view.tsx, pas sonner), useFetch/@/hooks/use-fetch, helpers cn(@/lib/utils), tokens Tailwind gold/gold-soft définis dans globals.css (oklch).
- Créé src/app/api/events/route.ts :
  * GET ?month=YYYY-MM (défaut = mois courant UTC, valeur invalide ignorée) : bornes 1er jour 00:00:00.000 → dernier jour 23:59:59.999 UTC (Date.UTC(y, m+1, 0, 23:59:59.999)), findMany where date gte/lte, orderBy date asc puis startTime asc → { events } (sérialisation ISO native de NextResponse.json).
  * POST : title obligatoire (400 "Le titre est obligatoire"), date validée regex YYYY-MM-DD + parsable (400 "Date invalide"), stockée new Date(`${date}T12:00:00.000Z`) (midi UTC anti-décalage fuseau), color ∈ {green,gold,orange,red} défaut green, type ∈ {RDV,TACHE,RAPPEL} défaut RDV, startTime/endTime validées HH:mm sinon null (regex ^([01]\d|2[0-3]):[0-5]\d$), description trim ou null → 201 { event }.
- Créé src/app/api/events/[id]/route.ts :
  * PUT partiel : findUnique préalable → 404 "Événement introuvable" ; chaque champ présent est revalidé (title non vide, date reconvertie en T12:00:00.000Z, heures HH:mm, color/type filtrés, done boolean) ; update → { event }.
  * DELETE : findUnique → 404, delete → 200 { ok: true }.
- Créé src/components/calendar-view.tsx ('use client', export default CalendarView, aucune modification d'autres fichiers) :
  * En-tête de vue style immo-view : titre "Calendrier" + sous-titre, à droite "Aujourd'hui" (outline) et "Nouvel événement" (primary).
  * Grille mensuelle grid-cols-7 semaines commençant lundi (offset (getUTCDay()+6)%7, 42 cellules UTC) : en-têtes Lun→Dim, navigation ChevronLeft/Right + libellé fr-FR "septembre 2026" (Intl month long + year, timeZone UTC), jours adjacents grisés (bg-muted/40 opacity-60), jour courant ring-2 ring-gold + bg-gold-soft/40 + numéro en badge circulaire vert (bg-primary rounded-full).
  * Cellules h-24 lg:h-28 (overflow-hidden, gap-1) : jusqu'à 3 événements en pastilles (barre colorée w-1 self-stretch + titre tronqué sur ≥sm ; simple point coloré sur mobile), done = line-through + opacity-60, "+N autre(s)" au-delà de 3 ; couleurs : green=bg-primary, gold=bg-gold, orange=bg-orange-500, red=bg-red-500.
  * Interactions : clic événement (stopPropagation) → dialog détail ; clic cellule (role=button tabIndex=0 + Enter/Espace) → dialog création avec date pré-remplie.
  * Dialog détail : badges type + couleur (avec point) + "Fait", date longue fr-FR · "10:00 – 11:30" (ou "Toute la journée"), description (whitespace-pre-wrap, repli italique), actions Supprimer (destructive, à gauche) / Fermer / Marquer fait-à faire (PUT done toggle, libellé dynamique) / Modifier (bascule le même dialog en mode formulaire).
  * Dialog création-édition : Titre* (Input), Date (type date), Début/Fin (type time), Type (Select Rendez-vous/Tâche/Rappel), Couleur (4 pastilles rondes cliquables ring-2 ring-gold ring-offset-2 si sélectionnée, role=radio), Description (Textarea) ; validation client titre/date, POST ou PUT selon selected, toasts "Événement créé"/"Événement modifié", erreurs API affichées ; en édition "Annuler" revient au détail.
  * Panneau latéral (lg:grid-cols-[1fr_320px], empilé sous la grille sur mobile) : "À venir" = 6 prochains événements ≥ aujourd'hui (fusion des mois courant+2 via Promise.all sur GET ?month, tri date/heure, cartes compactes point couleur + date courte fr-FR + heure + titre + badge type, clic → détail ; "Rien à venir" si vide, skeletons au chargement) + mini-stats 3 colonnes du mois affiché (RDV à venir ≥ aujourd'hui / Tâches / Rappels).
  * Chargement : 42 skeletons de cellules pendant le fetch du mois ; framer-motion fade-in de la vue ; aria-labels partout (navigation, cellules, radios, select) ; responsive 390px validé par construction (grid-cols-7 sans scroll, points au lieu de pastilles, dialogs sm:max-w-lg).
- Conventions respectées : aucun fichier existant modifié ; dates sérialisées ISO (string côté frontend via CalendarEvent de types.ts) ; clés de jour AAAA-MM-JJ dérivées de l'ISO (slice 0,10) — cohérent avec le stockage à midi UTC, insensible au fuseau.

Stage Summary:
- Backend calendrier complet : GET mensuel borné UTC, POST validé (titre/date/heure/couleur/type, date stockée à midi UTC), PUT partiel et DELETE avec 404 dédiés.
- Frontend CalendarView autonome : grille mensuelle lundi-dimanche avec navigation, pastilles 4 couleurs + tâches barrées, dialogs détail + création/édition complets (CRUD, toggle fait, toasts), panneau "À venir" et mini-stats mensuelles, thème vert & or (ring-gold, bg-gold-soft, badges), responsive mobile 390px.
- Prêt à être câblé dans app-shell (non fait volontairement — fichiers existants intouchables) ; API testable : /api/events et /api/events/[id].

---
Task ID: 15-a
Agent: sous-agent boîte mail
Task: Module boîte mail (réception IMAP, envoi SMTP, UI 3 zones)

Work Log:
- Lu worklog.md (Tasks 10-14) + conventions : toasts via @/hooks/use-toast, useFetch/useDebouncedValue, authFetch, pattern routes dynamiques { params: Promise<...> } (Next 16), modèles Prisma Mail/Setting déjà en base, packages nodemailer@10 + imapflow@2 déjà installés.
- Créé src/app/api/mails/route.ts : GET ?folder=&q= → { mails (tri sentAt desc, limit 200, filtre contains sur subject/from/to/body), counts (inbox, unread, sent, trash comptés sur TOUS les dossiers) } ; POST { to, subject, body } avec validation "@", envoi réel via nodemailer (createTransport host/port/secure/auth depuis Setting) si smtpHost && smtpUser && smtpPass, sinon enregistrement local ; retourne 201 { mail, delivered } (delivered = true si envoi SMTP réel, false sinon), 502 "Échec d'envoi SMTP : …" si l'envoi échoue. Note SQLite : contains = LIKE donc déjà insensible à la casse (ASCII), pas de mode:"insensitive" (non supporté sur SQLite).
- Créé src/app/api/mails/[id]/route.ts : GET { mail } (404 "Mail introuvable") ; PUT { read?, starred?, folder? } update partiel (validation folder ∈ INBOX|SENT|TRASH) ; DELETE : folder === "TRASH" → delete() définitif, sinon update folder="TRASH" (corbeille).
- Créé src/app/api/mails/sync/route.ts : POST — 400 si imapHost/imapUser/imapPass manquants ("IMAP non configuré…") ; sinon ImapFlow (import default + destructuration, forme type-safe pour imapflow v2 ESM/CJS), secure = port === 993, mailboxOpen("INBOX"), fetch des 50 derniers messages ({ uid, envelope } via range N-49:*), un seul findMany des messageId existants pour le dédoublonnage (+ Set anti-doublon intra-lot), fetchOne(uid, { source: true }) par nouveau message → extractTextFromSource (helper local : découpe headers/body, multipart récursif avec préférence text/plain, base64 / quoted-printable, strip HTML, plafond 100k) ; read=false, sentAt=envelope.date ?? now, to=imapUser ; logout ; update Setting.lastMailSync ; 200 { imported, total } ; toute erreur IMAP → 502 "Échec IMAP : …" avec client.close() propre.
- Créé src/app/api/mail-settings/route.ts : GET → { config: MailConfig } SANS mots de passe (smtpConfigured/imapConfigured = host && user && pass non vides, lastMailSync ISO) ; PUT réservé ADMIN via getAuthUser (403 "Accès réservé à l'administrateur"), upsert id "main", smtpPass/imapPass vides ou absents → conservation des anciens, ports coercés numériques.
- Créé src/components/mail-view.tsx ('use client', default export MailView) : layout 3 zones desktop (grid lg:grid-cols-[210px_1fr_1.15fr] avec minmax(0,…)) — gauche : Nouveau message (primary), Synchroniser (outline + spinner), dossiers Boîte de réception (badge non-lus doré border-gold/50 bg-gold-soft), Envoyés, Corbeille, Configuration (Settings2) ; centre : Input recherche (icône Search) + liste (avatar initiale or, point vert + fond bg-primary/[0.04] si non lu, objet en gras si non lu, extrait 1 ligne, heure relative FR, étoile toggle fill-gold) ; droite : ReadPane (objet, De/À, date complète FR, corps whitespace-pre-wrap max-h + overflow-y-auto, boutons Répondre → préremplit compose to=from|to, subject "Re: …", Supprimer, Restaurer si TRASH, animation framer-motion subtile). Mobile : boutons en haut (nav dossiers en rangée scrollable), liste seule, panneau de lecture en overlay fixed inset-0 avec bouton retour.
- Dialog compose (À/Objet/Message) → POST /api/mails → toast "Message envoyé" ou "Message enregistré localement (SMTP non configuré)" selon delivered, rafraîchit la liste ; Dialog configuration (Nom d'expéditeur, SMTP hôte/port/user/password/TLS direct checkbox, IMAP hôte/port/user/password, badges "SMTP/IMAP configuré — Non configuré" vert/gris) → PUT /api/mail-settings, toast succès ou destructif avec l'erreur serveur (403 admin), mots de passe jamais pré-remplis ; bandeau Alert bordure or "SMTP non configuré…" en haut quand smtpConfigured=false.
- Marquage lu optimiste (décrément badge non-lus), étoile optimiste avec rollback, suppression/restauration avec toasts ; skeletons de chargement, état vide Inbox + "Aucun message" ; scrollbars stylées du thème via les classes globales ; aria-labels, role="button" + navigation clavier sur les lignes.
- Vérification TypeScript (bunx tsc --noEmit) : 0 erreur dans les 5 fichiers créés (erreurs préexistantes hors périmètre : examples/, prisma/seed.ts, src/lib/pdf.ts, api/invoices, api/reports — non modifiés). Lint et serveur non lancés (consigne) ; aucun fichier existant modifié.

Stage Summary:
- Module boîte mail complet livré : GET/POST /api/mails, GET/PUT/DELETE /api/mails/[id], POST /api/mails/sync (IMAP dédoublonné par messageId, 50 derniers messages), GET/PUT /api/mail-settings (admin only, mots de passe jamais exposés).
- La boîte fonctionne en local sans SMTP : les messages envoyés sont enregistrés dans "Envoyés" avec delivered=false et l'UI affiche le toast local + bandeau or ; dès que SMTP/IMAP sont renseignés (dialog Configuration, réservé ADMIN en écriture), l'envoi devient réel et la réception se synchronise.
- UI 3 zones responsive (liste+lecture en overlay sur mobile), thème vert & or, animations subtiles, états chargement/vide/erreur soignés.
- Points d'attention pour les agents suivants : ne pas ajouter mode:"insensitive" sur SQLite ; importer ImapFlow via l'export par défaut d'imapflow v2 ; le raccord final dans app-shell.tsx (ViewId "mail" → import MailView) reste à faire par l'agent chargé de la navigation.

---
Task ID: 15-d
Agent: Z.ai Code (principal)
Task: Intégration du lot 15 — navigation, corrections, tests end-to-end, création du repo GitHub topmuch/2mailsnew et push.

Work Log:
- Schéma Prisma (Task 15, fondations) : modèles `Mail` (direction IN/OUT, folder INBOX/SENT/TRASH, messageId pour dédoublonnage IMAP, read/starred), `CalendarEvent` (date à midi UTC, startTime/endTime HH:mm, color green/gold/orange/red, type RDV/TACHE/RAPPEL, done), `QrLookup` (provider QRTAG/QRBAGS, query, options/result JSON, status) + configuration boîte mail sur `Setting` (mailFromName, smtpHost/Port/User/Pass/Secure, imapHost/Port/User/Pass, lastMailSync). `bun run db:push` OK. Dépendances ajoutées : nodemailer@10, imapflow@2, @types/nodemailer.
- Types partagés ajoutés à src/lib/types.ts : Mail, MailCounts, MailConfig, CalendarEvent, QrLookup, QrTagResult, QrBagsResult. Seed `prisma/seed-v4.ts` : 6 mails de démonstration (4 reçus dont 2 non lus, 2 envoyés) + 5 événements calendrier (RDV/Tâche/Rappel, couleurs variées).
- Recherche des 2 services demandés : **QRtag.net** = API gratuite de génération de QR en image (`https://qrtag.net/api/qr[_transparent][_N].[png|svg]?url=…`, 1 000 req/10 min) ; **QRBags** (qrbags.com) = étiquettes QR bagages traçables, suivi public via page `/suivi/{REF}` avec référence au format strict `^(HAJJ|VOL)\d{2}-[A-Z0-9]{6}$` (regex extraite du bundle JS du site) ; pas d'API REST publique documentée pour QRBags (endpoints sondés : 404) → intégration par vérification serveur de la page de suivi + extraction d'indices + lien officiel.
- Sous-agents 15-a (boîte mail : API mails/mail-settings/sync + mail-view 3 zones), 15-b (calendrier : API events + calendar-view grille mensuelle lundi-premier), 15-c (QR : API qr/qrtag, qr/qrbags, qr/history + qr-view à onglets) — fichiers créés selon spec, conventions respectées.
- Intégration : app-shell.tsx — ViewId +3 (calendrier, mails, qrtags), NAV sections « Pilotage » (Calendrier) et « Communication » (Boîte mail, QR & Étiquettes), imports default, rendu des vues ; fix 2 fichiers de routes perdus recréés (events/route.ts, qr/qrtag/route.ts) ; fix export default des 3 composants ; fix directive eslint inutile ; fix responsive : grilles sans colonne explicite passaient en auto (scrollWidth 636px sur mobile) → `grid-cols-1` ajouté sur mail-view, calendar-view, qr-view (2 grilles) → 390 px partout.
- Environnement : la table User a de nouveau été vidée par l'infrastructure entre-temps → admin/admin123 recréé (upsert scrypt) ; mails/événements démo intacts.
- Tests agent-browser (1440×900 + 390×844) : Boîte mail — dossiers avec badges (Réception 2 non lus, Envoyés), liste avec avatars/points non-lus/étoiles, ouverture d'un mail → passage lu 2→1, panneau de lecture complet (De/À/date FR/corps), compose → envoi enregistré (Envoyés 3) + toast, Synchroniser sans IMAP → toast destructif « IMAP non configuré — renseignez les serveurs dans la configuration », bandeau SMTP non configuré ; Calendrier — septembre 2026, « À venir » avec 5 événements (pastilles couleur + badges type), création « Réunion équipe hebdomadaire » (mar. 22 sept) visible immédiatement, mini-stats RDV/Tâches/Rappels ; QR & Étiquettes — génération d'un vrai QR code via QRtag.net (https://etslampfall.sn/facture/FV-2026-0001, PNG taille 4) affiché avec badges + toast « QR généré », suivi QRBags HAJJ25-K7P3MQ → « Format valide · Service joignable » (serveur réel contacté, page de suivi détectée) + bouton page officielle, réf. invalide ABC123 → toast « Format invalide — Attendu : HAJJ25-ABC123 ou VOL25-ABC123 », historique des recherches (QRBAGS/QRTAG) ; mobile 390 px sans scroll horizontal sur les 3 vues ; lint 0 erreur ; dev.log propre.
- GitHub : création du repo `topmuch/2mailsnew` via API (public) puis push du code complet sur `main`.

Stage Summary:
- Le système dispose désormais d'une Boîte mail (réception IMAP configurable, envoi SMTP réel via nodemailer avec repli local), d'un Calendrier d'activité (événements colorés par type, à venir, stats) et d'un module QR & Étiquettes branché sur les deux services demandés (génération QRtag.net fonctionnelle, vérification d'étiquettes QRBags avec format officiel et lien de suivi).
- Nouveaux artefacts : src/app/api/{mails/*,mail-settings,events/*,qr/*}, src/components/{mail-view,calendar-view,qr-view}.tsx, prisma/seed-v4.ts ; configuration SMTP/IMAP dans le dialog « Configuration » de la Boîte mail (réservé admin).
- Repo GitHub : https://github.com/topmuch/2mailsnew (code poussé).

---
Task ID: 16
Agent: Z.ai Code (principal)
Task: Préparer le code pour une installation Coolify (déploiement Docker auto-hébergé).

Work Log:
- Audit du Dockerfile existant (hérité d'un ancien essai) : il re-clonait GitHub au moment du build (cassé si repo privé, aucun cache Docker, dépendance réseau) et masquait les erreurs de schéma (`prisma db push 2>/dev/null || true`) — réécriture complète.
- Réécrit `Dockerfile` en build multi-stage : (1) `oven/bun:1` — `bun install --frozen-lockfile` (bun.lock) ; (2) builder — `bunx prisma generate` + `bun run build` (Next standalone, copie .next/static + public via le script build) ; (3) runner `node:20-slim` — copie de `.next/standalone`, de la CLI Prisma (`node_modules/prisma`, `.prisma`, `@prisma`) pour le `db push` au démarrage, de `sharp` + `@img` (optimisation next/image), du schéma et des scripts ; `apt openssl ca-certificates tzdata` ; ENV PORT=3000, HOSTNAME=0.0.0.0, TZ=Africa/Dakar, DATABASE_URL=file:/app/data/lampfall.db ; EXPOSE 3000 ; HEALTHCHECK sur /api/health (fetch natif Node 20) ; ENTRYPOINT = scripts/docker-entrypoint.sh.
- Créé `.dockerignore` : exclus node_modules, .next, bases SQLite locales (db/, *.db), .env, logs, .git, tool-results, agent-ctx, tests, examples — le build part du contexte du repo (Coolify clone lui-même le dépôt).
- Créé `scripts/docker-entrypoint.sh` (POSIX sh, set -e) : déduit le dossier de données de DATABASE_URL, `prisma db push --skip-generate` SANS --accept-data-loss (échec visible dans les logs Coolify en cas d'évolution destructrice, plutôt que perte de données), puis seed admin, puis `exec node server.js` (le serveur standalone respecte $PORT/$HOSTNAME).
- Créé `scripts/seed-admin.mjs` (JS pur exécutable sous Node dans l'image finale) : upsert Setting "main" + création du compte admin/admin123 (hash scrypt identique à src/lib/auth.ts) si absent, mot de passe surchargeable via ADMIN_PASSWORD — idempotent à chaque démarrage.
- Créé `src/app/api/health/route.ts` : sonde de santé — 200 {status:"ok", db:true} si la base répond, 503 sinon (console.error "GET /api/health").
- Créé `docker-compose.yml` (variante Coolify "Docker Compose") : service lampfall, volume nommé lampfall-data → /app/data, healthcheck, restart unless-stopped, env AUTH_SECRET/ADMIN_PASSWORD surchargeables.
- Créé `.env.example` (DATABASE_URL, PORT, TZ, AUTH_SECRET recommandé en prod via openssl rand -hex 32, ADMIN_PASSWORD) + exception `!.env.example` dans .gitignore (le motif `.env*` l'ignorait).
- Rédigé `COOLIFY.md` : guide FR complet — prérequis, méthode A "Dockerfile" (port 3000, variables, ⚠ stockage persistant /app/data, healthcheck, domaine/SSL), méthode B "Docker Compose", première connexion admin/admin123, mises à jour (Redeploy + db push automatique), sauvegardes (volume + export JSON), dépannage, note SQLite mono-instance.
- Vérifications : syntaxe `sh -n` de l'entrypoint OK ; `bun scripts/seed-admin.mjs` exécuté réellement (upsert idempotent OK) ; `bunx prisma db push --skip-generate` → "already in sync" ; lint 0 erreur ; dev server 200 ; agent-browser : dashboard rendu avec données réelles (KPI, graphique recharts, dernières factures), /api/health renvoie {"status":"ok","db":true}, console propre sans erreur JS.
- Découvert en route : les 2 commits de la Task 15 (b666933 + 76d8a16) n'étaient pas encore sur origin (Lampfall) — poussés dans ce lot.

Stage Summary:
- Le dépôt est désormais 100 % prêt pour Coolify : "New Resource → Dockerfile", port 3000, stockage persistant /app/data, déployer. Premier démarrage = schéma + admin créés automatiquement.
- Fichiers : Dockerfile (réécrit), .dockerignore, scripts/docker-entrypoint.sh, scripts/seed-admin.mjs, src/app/api/health/route.ts, docker-compose.yml, .env.example (+ .gitignore !.env.example), COOLIFY.md.
- Le code est poussé sur les deux dépôts : topmuch/Lampfall (origin, rattrapage Task 15 inclus) et topmuch/2mailsnew (miroir tenu à jour) — Coolify peut pointer sur l'un ou l'autre.

---
Task ID: 17
Agent: Z.ai Code (principal)
Task: Correction de dépôt — restaurer topmuch/Lampfall à son état d'origine ; le nouveau code (Task 15 + Coolify) vit uniquement dans topmuch/2mailsnew.

Work Log:
- L'utilisateur a signalé une erreur de dépôt : les commits Task 15 (mails/calendrier/QR) et Task 16 (Coolify) ne devaient pas être poussés sur topmuch/Lampfall mais uniquement sur le nouveau dépôt topmuch/2mailsnew.
- Vérifié ls-remote des deux dépôts : Lampfall et 2mailsnew étaient tous deux à 7c21968.
- Restauré topmuch/Lampfall par force push : main ramené de 7c21968 → 8526fe3 (état validé Task 14 : app de facturation avec facture/proforma Times New Roman italique, SANS les modules mails/calendrier/QR ni les fichiers Coolify). Vérifié ensuite par ls-remote : refs/heads/main = 8526fe3.
- topmuch/2mailsnew conservé à 7c21968 : il contient l'intégralité du code (facturation + mails + calendrier + QR + préparation Coolify complète). Diff 8526fe3..7c21968 vérifié : 32 fichiers, +5 046 lignes (Dockerfile, .dockerignore, COOLIFY.md, docker-compose.yml, scripts/, api/health, api/mails*, api/events*, api/qr*, mail-view, calendar-view, qr-view, schema Mail/CalendarEvent/QrLookup, seed-v4, types).
- Le projet local reste le code complet (7c21968 + ce journal) : toutes les fonctionnalités continuent de fonctionner en développement.
- Remote nommé « 2mailsnew » ajouté en local pour éviter toute confusion future (origin = Lampfall, conservé pour l'historique).

Stage Summary:
- topmuch/Lampfall = version facturation d'origine (8526fe3) — restauré à la demande.
- topmuch/2mailsnew = dépôt de développement courant avec tous les modules et la préparation Coolify → c'est LUI qu'il faut connecter dans Coolify.
- Ne plus jamais pousser de nouveau code vers Lampfall sans demande explicite de l'utilisateur.

---
Task ID: 18
Agent: Z.ai Code (principal)
Task: Adapter le Dockerfile modèle (fourni par l'utilisateur, style « qrbags » : build par git clone GitHub) au projet topmuch/2mailsnew — sans rien changer d'autre — avec la base de données renommée pour 2mails et la création automatique des identifiants de connexion au démarrage.

Work Log:
- Erreur précédente corrigée : ne PAS travailler sur qrbags (simple gabarit fourni par l'utilisateur) mais adapter le modèle AU projet local /home/z/my-project poussé sur topmuch/2mailsnew.
- Vérifié que topmuch/2mailsnew est publiquement clonable (git ls-remote anonyme OK, HEAD 5096879) — indispensable car le modèle fait « git clone https://github.com/topmuch/2mailsnew.git . » au moment du build.
- Vérifié que scripts/seed-admin.mjs existe (Task 16) : JS pur Node 20, ESM, @prisma/client + node:crypto scrypt (même hash que src/lib/auth.ts), upsert Setting « main » + création admin/admin123 (ou $ADMIN_PASSWORD), rôle ADMIN, actif true, idempotent → sert à « créer les identifiants de connexion » sans ajouter aucun fichier.
- Réécrit UNIQUEMENT /home/z/my-project/Dockerfile en suivant la structure du modèle fourni (FROM node:20-alpine, apk git libc6-compat sqlite, npm install -g bun, WORKDIR /app, git clone 2mailsnew, bun install, npx prisma generate, bun run build, mkdir /app/data, EXPOSE 3000, CMD sh -c avec prisma db push + création admin + node .next/standalone/server.js). Aucun autre fichier modifié.
- Adaptations du modèle : URL de clone → topmuch/2mailsnew.git ; base de données → file:/app/data/2mails.db (demande « change les database dans le docker 2mails », remplace qrbag.db du gabarit) ; « node scripts/create-admin.cjs » (inexistant chez nous) → « node scripts/seed-admin.mjs » (existant, crée les identifiants).
- Le script build du projet copie déjà .next/static et public dans .next/standalone → « node .next/standalone/server.js » fonctionne avec output standalone.
- Commit + push sur 2mailsnew UNIQUEMENT (jamais Lampfall, cf. Task 17).

Stage Summary:
- Dockerfile « modèle qrbags » adapté à 2mailsnew : build par git clone du dépôt public, base SQLite /app/data/2mails.db (volume persistant Coolify), schéma poussé + identifiants admin/admin123 créés à chaque démarrage via scripts/seed-admin.mjs, serveur standalone sur le port 3000.
- Le seul fichier touché est le Dockerfile ; tout le reste du projet est inchangé.

---
Task ID: 19
Agent: Z.ai Code (principal)
Task: Supprimer les modules « Commerçant » (achats à crédit) et « Immo » (achats à crédit + gestion locative) à la demande de l'utilisateur.

Work Log:
- Supprimé les fichiers : src/components/credit-purchases-view.tsx, src/components/transfer-credit-dialog.tsx, src/components/immo-view.tsx, src/app/api/credit-purchases/ (route + [id] + payments), src/app/api/rents/, src/app/api/tenants/.
- prisma/schema.prisma : retiré les modèles Tenant, Rent, CreditPurchase, CreditPayment → bun run db:push (base synchronisée, client Prisma régénéré) → redémarrage du serveur de dev.
- app-shell.tsx : retiré les entrées de navigation « commercant » et « immo » (section Crédits), le ViewId correspondant, l'import CreditPurchasesView et les icônes Store/Building2.
- invoices-view.tsx : retiré la fonctionnalité « Transférer en achat à crédit » (import TransferCreditDialog, type CreditPurchase, état transferTarget, fetch /api/credit-purchases, transferMap, badge Crédit sur les lignes, item de menu, prop alreadyTransferred) + icône CreditCard.
- invoice-editor.tsx : retiré le bloc « Classement du crédit » (type Destination, props alreadyTransferred, états destination/creditTier/creditDueDate/creditNote, POST /api/credit-purchases dans le submit, destinationOptions, cartes UI) + icônes Store/Building2/CheckCircle2/CreditCard ; texte d'aide mis à jour.
- dashboard-view.tsx : retiré le KPI « Crédits à payer » et la BigStat « Achats à crédit » + icônes Store/Building2 ; api/dashboard : retiré la requête creditPurchase et le bloc `credit` de la réponse.
- api/reports/daily : retiré creditPayment (requête, creditPaidTotal, creditPayments dans la réponse) ; pdf.ts : retiré la section « Règlements crédit (Commerçant / Immo) » du rapport du jour, grandTotal = receivedTotal.
- pdf.ts : retiré buildRentReceiptPDF et buildTenantRentsPDF (quittance + échéancier loyers) et les imports Tenant/Rent/RENT_STATUS_LABELS/monthLabel ; troncature du fichier à 1691 lignes.
- types.ts : retiré Tenant, Rent, CreditPayment, CreditPurchase, DailyCreditPaymentRow, creditPaidTotal, creditPayments, credit (DashboardStats). constants.ts : retiré Tenant/Rent des AUDIT_ENTITY_LABELS et RENT_STATUSES/RENT_STATUS_LABELS. status-badges.tsx : retiré RentStatusBadge.
- login-view.tsx : retiré la carte « Gestion locative immo », fallback tagline « Facturation • Stock • Gestion », bandeau « Immobilier » supprimé. settings-view.tsx : label tenants retiré.
- api/admin/backup : retiré tenants (findMany, data, counts). api/admin/restore : retiré TENANT_FIELDS/RENT_FIELDS, sanitize tenants/rents, purge et recréation. prisma/seed-v2.ts : section Immobilier + helpers monthStr/daysAgo supprimés.
- Vérifications : rg = 0 référence restante ; lint 0 erreur/0 warning ; API health OK, dashboard 200, credit-purchases & rents 404, daily OK.
- Agent-browser : connexion admin, sidebar sans Commerçant/Immo (desktop + drawer mobile), dashboard sans KPI crédit, création facture FV-2026-0008 (TVA 18 % calculée, « Document enregistré ») puis suppression, proforma sans bouton de transfert, Rapports OK, 0 erreur console, dev.log propre.

Stage Summary:
- Les modules « Commerçant — Achats à crédit » et « Immo — Achats à crédit » ainsi que la gestion locative immobilière (locataires/loyers/quittances) sont entièrement supprimés : UI, API, schéma Prisma, seeds, sauvegarde/restauration, PDF.
- Les factures/proformas retrouvent un flux simple : plus de transfert à crédit. La fonctionnalité Paiements multiples (versements par facture) est conservée.
- Application vérifiée de bout en bout dans le navigateur après suppression.

---
Task ID: 20
Agent: Z.ai Code (principal)
Task: Intégrer dans 2mails le CRM Unifié (adaptation du prompt « crm-unifie » de l'utilisateur) — onglets de suivi des QR codes qrtags.pro / qrbags.com activés, perdus, retrouvés, scannés — SANS rien supprimer et SANS créer de projet séparé.

Work Log:
- Adaptation du prompt utilisateur : pas de projet « crm-unifie » séparé ni de PostgreSQL — intégration directe dans 2mails (Next.js 16, Prisma SQLite, auth existante, sidebar existante). Aucune fonctionnalité existante modifiée ou supprimée.
- prisma/schema.prisma : ajout de 4 modèles préfixés Crm (évite le conflit avec Client de la facturation) : CrmPlatform (name QRTAGS|QRBAGS unique, label, apiUrl, apiKey, webhookSecret, isActive, lastSyncAt), CrmItem (platformId+externalId unique, code, type TAG|BAGAGE, status ACTIVE|LOST|FOUND|SUSPENDED|INACTIVE, ownerName/Phone/Email, clientId → CrmClient, lastScanAt, lastScanPlace, scanCount, raw JSON, index platformId/status/type), CrmActivity (platform, itemId, action SCAN|ACTIVATION|LOST|FOUND|SUSPENDED|SYNC|WEBHOOK_ERROR|UPDATED, details, timestamp indexé), CrmClient (name, email, phone, totalItems, status, notes). bun run db:push OK.
- src/lib/crm-api.ts : couche d'intégration API — getPlatformConfig (env QRTAGS_API_URL/QRTAGS_API_KEY/QRBAGS_API_URL/QRBAGS_API_KEY en priorité, sinon base), fetchItemsFromPlatform (GET {apiUrl}/api/admin/items, Bearer, normalisation tolérante), upsertCrmItem, reconcileCrmClients (rattachement auto par téléphone/e-mail + recalcul totalItems), syncPlatform, syncAllPlatforms, ensurePlatformsSeeded.
- API routes (namespace /api/crm) : webhooks (POST — validation secret X-Webhook-Secret/Bearer/query, événements item_activated/item_scanned/item_lost/item_found/item_suspended + alias, upsert item + ActivityLog, GET doc) ; sync (POST, admin, une ou toutes plateformes) ; items (GET filtres platform/status/type/q) ; stats (GET compteurs par statut/plateforme, scans du jour, activité récente, derniers événements) ; activity (GET flux limité) ; clients (GET/POST) ; clients/[id] (PUT/DELETE admin) ; platforms (GET clés masquées, PUT admin).
- Composants src/components/crm/ : crm-shared.tsx (formatRelativeFr, ItemStatusBadge, ACTION_META), crm-dashboard-view.tsx (vue d'ensemble : 4 stat cards, cartes plateformes avec bouton Config (dialog apiUrl/apiKey/webhookSecret/isActive admin), encart webhook, derniers événements + flux d'activité polling 30 s, bouton Synchroniser maintenant), crm-items-view.tsx (tableau items filtrable, compteurs rapides, sync par plateforme, polling 30 s, réutilisé par les 2 onglets), crm-clients-view.tsx (CRUD clients CRM).
- app-shell.tsx : ViewId + « crm », « crm-qrbags », « crm-qrtags », « crm-clients » ; nouvelle section sidebar « CRM Unifié » (Globe2/Luggage/ScanLine/Contact) placée après Pilotage ; mapping des vues. L'onglet existant « QR & Étiquettes » (qrtags) est conservé sans conflit.
- Correction : icône Config inexistante dans lucide-react → Settings2.
- Tests API (curl) : webhooks ACTIVATION (→ ACTIVE), LOST (→ LOST), SCAN (→ scanCount+1, lieu), secret invalide → 401 ; stats totals items=2, scansToday=1, byStatus ACTIVE=1/LOST=1 ; items filtrés OK ; plateforme non authentifiée → 401.
- Tests navigateur (agent-browser) : login admin, sidebar avec les 4 onglets, vue CRM (stats + cartes plateformes + encart webhook + événements), QR Bags (VOL25-MB8K2X Perdu — Aéroport Blaise Diagne), QR Tags (HAJJ25-A1B2C3 Actif — HLM Grand Yoff), création client « Fatou Ndiaye » (dialog + table), mobile iPhone 14 OK, 0 erreur console, lint 0 erreur.
- Redémarrage du serveur de dev requis après db:push (client Prisma rechargé) ; redémarrage via bash -c setsid nohup.

Stage Summary:
- Le CRM Unifié est intégré à 2mails en tant que 4 nouveaux onglets (CRM Unifié, QR Bags, QR Tags, Clients CRM) : suivi centralisé des items des plateformes qrtags.pro et qrbags.com alimenté par webhooks sécurisés (POST /api/crm/webhooks avec X-Webhook-Secret) et synchronisation manuelle (GET {apiUrl}/api/admin/items).
- Aucune donnée existante modifiée ; le déploiement Coolify existant fonctionne tel quel (prisma db push crée les nouvelles tables au démarrage du conteneur).
- Configuration à faire en production : bouton « Config » dans l'onglet CRM (admin) pour renseigner URL API + clé API de chaque plateforme, définir le secret webhook, puis l'entrer aussi dans l'admin de qrtags.pro/qrbags.com avec l'URL {domaine}/api/crm/webhooks.
- En attente : 2ᵉ prompte de l'utilisateur.

---
Task ID: 21
Agent: Z.ai Code (principal)
Task: Adapter le « Prompt 2 » (Dashboard Unifié & Consommation d'API) au CRM déjà intégré dans 2mails — enrichir l'onglet « CRM Unifié » existant avec les StatsCard, ActivityFeed, SyncButton, camembert de répartition, skeletons — sans rien supprimer.

Work Log:
- Adaptation : pas de page app/dashboard séparée ni de Server Component isolé — le « Tableau de Bord Unifié » vit dans l'onglet CRM existant (crm-dashboard-view.tsx) et consomme la couche API locale /api/crm/stats (webhooks + sync agrégés en base).
- prisma/schema.prisma : CrmPlatform.estimatedPackPrice Float @default(0) ajouté (prix estimé d'un pack en FCFA pour la carte « Revenu estimé ») → bun run db:push OK (additif).
- API /api/crm/stats enrichie (additif) : platformStats par plateforme (items, activationsToday, scansToday, newItemsToday ≈ packs vendus, found, lost, successRate, estimatedPackPrice, estimatedRevenue = newItemsToday × prix pack, activitiesToday), pieData (répartition QRTAGS/QRBAGS de l'activité du jour), totals étendus (activationsToday, found, lost, successRate, estimatedRevenue, newItemsToday). Tous les champs historiques conservés.
- API /api/crm/platforms : PUT accepte estimatedPackPrice ; GET/PUT le renvoient.
- src/lib/crm-format.ts (adaptation de lib/api.ts du prompt) : formatFcfa, formatNumber, formatTodayLong, dominantTone (QRTags dominant → or, QRBags dominant → bleu, égalité → vert), platformSubValue (« QRTags : 12 | QRBags : 8 »), sumPlatforms, pieColor, pieTotal.
- Composants : stats-card.tsx (StatsCard : titre, valeur, subValue, icône, trend, bordure gauche colorée or/bleu/vert + StatsCardSkeleton), activity-feed.tsx (flux des derniers webhooks, icône par plateforme — Luggage bleu QRBags / QrCode or QRTags, indicateur « ● LIVE » vert clignotant si webhook < 1 min avec re-render 15 s, état vide « Aucune activité aujourd'hui »), sync-button.tsx (Synchroniser maintenant / par plateforme).
- crm-dashboard-view.tsx enrichi : en-tête « CRM Unifié — Tableau de Bord » + date du jour longue + SyncButton ; 4 StatsCards (Total activations, Total scans, Objets retrouvés + taux de succès, Revenu estimé avec packs vendus) avec sous-valeurs par plateforme ; cartes plateformes conservées + mini-stats du jour ; encart webhook conservé ; camembert répartition (recharts via ChartContainer shadcn, innerRadius, Cell or/bleu, labels, état vide) ; carte Activations/Pertes/Retrouvailles conservée ; ActivityFeed intégré ; skeletons de chargement complets ; Config dialog + champ « Prix estimé d'un pack (FCFA) ».
- Corrections : Cell recharts (au lieu de span), Button shadcn dans le dialog, classe capitalize-first inexistante → first-letter:uppercase, icône Config → Settings2 (Task 20).
- Tests curl : stats enrichies OK (activationsToday=1, scansToday, pieData QRBAGS=2/QRTAGS=2), PUT estimatedPackPrice=5000 sur QRBAGS → revenu estimé total 5 000 FCFA (1 item du jour × 5 000).
- Tests navigateur : 4 StatsCards avec bonnes bordures colorées (bleu quand QRBags domine, or quand QRTags domine, vert global), sous-valeurs « QRTags : 0 | QRBags : 1 », camembert rendu (donut or/bleu avec labels), mini-stats par plateforme, webhook frais → flux mis à jour « à l'instant » + badge « ● LIVE » vert clignotant, compteurs temps réel (scans 1 → 2), 0 erreur console, lint 0 erreur.

Stage Summary:
- Le « Prompt 2 » est adapté et intégré : le Tableau de Bord Unifié du CRM affiche en temps réel (polling 30 s) les activations, scans, retrouvés (taux de succès), revenu estimé par packs, répartition QRTags/QRBags (camembert) et le flux des webhooks avec indicateur Live — le tout depuis la couche API locale, sans appel direct navigateur → plateformes.
- Skeleton loaders + états vides gérés ; design vert & or conservé (bleu réservé au code couleur QRBags demandé).
- Push 2mailsnew uniquement ; Coolify prendra la version automatiquement (db push additif).

---
Task ID: 22
Agent: Z.ai Code (principal)
Task: Adapter le « PROMPT MAÎTRE : CRM STANDALONE QRTAGS + QRBAGS AVEC AUTOMATISATIONS » au projet 2mails existant — rapports quotidiens (08h30/19h), Coach Virtuel (11h/14h/17h, 30 messages), rappels de RDV (J-1 18h / H-1 / H-15min), tâches, arrêt samedi 13h + dimanche (isBusinessHours) — sans rien supprimer.

Work Log:
- Adaptation (règle d'or) : réutilisation maximale de l'existant — CrmPlatform/CrmItem/CrmActivity/CrmClient (Task 20) pour les KPIs, modèle Invoice existant (factures impayées), CalendarEvent existant (cible des rappels, aucune modification du modèle), boîte mail existante (Mail + Setting SMTP/IMAP) au lieu de GmailConfig/Gmail API, auth scrypt maison au lieu de NextAuth, SQLite au lieu de PostgreSQL.
- prisma/schema.prisma : 4 modèles ajoutés (additif) → CrmTask (status TODO/IN_PROGRESS/DONE, priority), CrmCoachMessage (timeSlot 11h/14h/17h, category BUSINESS/MINDSET/CLOSING, isActive), CrmSentMessage (type REPORT_MORNING/REPORT_EVENING/COACH/REMINDER/TEST, dedupeKey, status SENT/FAILED, @@unique([type, dedupeKey]) pour l'idempotence), CrmAutomationConfig (singleton « main » : heures et switches des rapports/coach/rappels, ownerName, recipientEmail, dailyGoal) → bun run db:push OK.
- src/lib/crm-coach-seed.ts : les 30 messages du prompt (10×11h Business, 10×14h Mindset, 10×17h Closing) + ensureCoachMessagesSeeded() auto-seed idempotent (pattern ensurePlatformsSeeded) → 30 messages créés automatiquement au premier accès, aucune étape manuelle en prod.
- src/lib/crm-automation.ts : isBusinessHours (dimanche + samedi ≥ 13h = repos), getAutomationConfig, sendAutomationEmail (Nodemailer + SMTP du Setting, même pattern que /api/mails), getDailyKpis (activations/scans/retrouvés/packs vendus/CA estimé par plateforme), generateMorningReport (RDV du jour, tâches en retard + du jour, factures VENTE impayées avec échéances dépassées en rouge, 5 derniers e-mails reçus, objectif du jour aléatoire ou configuré), generateEveningReport (KPIs en tableau, tâches terminées, RDV passés, e-mails reçus/envoyés, suggestion dynamique pour demain), getRandomCoachMessage (pioche aléatoire + personnalisation ownerName), runReminders (J-1 18h fenêtre 18h00-18h14, H-1 [50-71 min], H-15 [8-21 min], skip si pas de startTime), runDueJobs (tick unique : compare HH:mm aux horaires configurés + rappels à chaque minute, idempotence par CrmSentMessage dedupeKey).
- src/lib/crm-scheduler.ts : node-cron « * * * * * » (1 seul tick/minute, anti-chevauchement, garde globalThis contre la double init hot-reload) ; src/instrumentation.ts : register() → startCrmScheduler() au boot Node (dev ET prod Coolify sans toucher au Dockerfile) ; node-cron@4.6.0 installé. Log confirmé : « [crm-scheduler] démarré — rapports 08h30/19h, coach 11h/14h/17h, rappels RDV ».
- API : /api/crm/automation/config (GET config+statut scheduler/businessHours/smtp/envois du jour ; PUT admin avec validation HH:mm), /api/crm/automation/logs (GET historique filtrable), /api/crm/automation/test (POST admin : MORNING/EVENING/COACH_11/COACH_14/COACH_17/REMINDERS — contourne isBusinessHours pour tester le week-end, dedupeKey -TEST- unique, renvoie le sujet/contenu en preview), /api/crm/tasks (GET filtres+compteurs, POST), /api/crm/tasks/[id] (PUT, DELETE admin), /api/crm/coach (GET bibliothèque+historique, POST/PUT/DELETE admin), /api/crm/coach/send (POST admin : envoi immédiat d'un message aléatoire).
- UI : 3 nouvelles vues dans la section CRM Unifié de la sidebar — crm-automations-view.tsx (3 cartes statut Planificateur/Période/SMTP avec icônes ✓/⚠, configuration complète switches+heures+destinataire+ownerName+objectif, 6 boutons de test, historique des envois en table), crm-tasks-view.tsx (4 compteurs, filtre statut, table avec badge retard, priorité, statut inline Select, dialog création/édition), crm-coach-view.tsx (3 cartes créneaux 11h/14h/17h avec compteurs actifs, switches actif/inactif, édition/ajout/suppression, bouton « Envoyer un 11h », historique des messages reçus) ; app-shell.tsx : ViewId étendu (crm-tasks, crm-automations, crm-coach), 3 entrées NAV (ListChecks, CalendarClock, Bot), mapping de rendu — aucune entrée existante modifiée.
- Corrections : import crm-format (src/lib, pas src/components/crm) → module not found réglé ; redémarrage serveur après db:push et pour charger instrumentation.ts.
- Tests API curl : config GET (schedulerRunning true, seededCoachMessages 30), test MORNING (rapport généré, preview « 📅 Votre briefing du jour — ETS LAMP FALL », échec SMTP attendu en local, message d'aide clair), EVENING OK, COACH send OK (message aléatoire du créneau), task créée (HIGH, échéance hier → « en retard »), PUT config OK, logs (COACH/TEST/FAILED journalisés avec erreur explicite).
- Tests navigateur : login admin, sidebar avec les 3 nouveaux onglets, Automatisations (3 cartes statut, config, historique), tâche visible « en retard », Coach Virtuel (10 messages/créneau, toggle actif/inactif OK), Calendrier existant intact, mobile iPhone 14 OK (menu sheet → Automatisations), desktop 1280 OK, 0 erreur console/page, lint 0 erreur.

Stage Summary:
- Les automatisations du Prompt Maître vivent dans 2mails : rapports 08h30/19h (briefing + bilan avec KPIs QRTags/QRBags et CA estimé), Coach Virtuel 3×/jour avec 30 messages seedés, rappels de RDV J-1/H-1/H-15 sur le calendrier existant, tout arrêté le samedi après 13h et le dimanche (isBusinessHours), idempotent (1 envoi max/créneau/jour).
- Le scheduler tourne dans le process Next.js via instrumentation.ts → fonctionne tel quel sur Coolify (aucun changement Dockerfile) ; les tables sont créées par prisma db push au démarrage du conteneur.
- Pour activer les envois en production : Paramètres → Boîte mail (SMTP) + Automatisations (e-mail destinataire optionnel) puis boutons de test. En local sans SMTP, les contenus restent générés et journalisés (statut FAILED avec la raison).
- Push 2mailsnew uniquement ; dépôt Lampfall intouché.

---
Task ID: 23
Agent: Z.ai Code (principal)
Task: Synchroniser GitHub avec la version locale + 5 demandes : supprimer l'onglet « QR & Étiquettes » (Communication), réorganiser la sidebar, remplacer tout « Lamp/Lampe Fall » par « 2mails », ajouter les onglets Leads / Tâches / Projets.

Work Log:
- Recherche exhaustive des mentions lampfall (grep src prisma Dockerfile) puis remplacement global par 2mails : layout.tsx (titre onglet), health, mails, mail-settings, backup (nom de fichier sauvegarde-2mails), qr/qrtag User-Agent, settings (défauts), constants, auth.ts (secret de signature → 2mails-facturation-secret-2024), pdf.ts (en-têtes, « Livré par », « Édité le »), crm-automation (gabarits e-mail), login-view, app-shell, invoice-share-dialog, settings-view, mail-view, qr-view, dashboard-view, schema.prisma (défauts nomSociete/email/mailFromName), seeds v3/v4, Dockerfile (commentaire ligne 1 uniquement).
- Nouveau logo 2mails généré par IA (carré vert, monogramme « 2m » doré, bordure or) → redimensionné 256px via sharp → public/logo-2mails.png + data-URL enregistrée dans Setting.logo ; fallback CompanyLogo, login-view, PDF, favicon et aperçu Paramètres pointent vers logo-2mails.png (logo-green.png conservé mais non référencé).
- Base de données : découverte d'un reset des données (users/clients/invoices/crm vides, Setting seul survivant avec l'ancien nom) lors du db:push de la session → re-seed complet (seed-v3 admin/admin123, seed-v2 catégories, seed.ts démo facturation, seed-v4 mails/calendrier) + update Setting (nomSociete/mailFromName/email → 2MAILS/contact@2mails.sn) + re-config des plateformes CRM (secret webhook + prix packs) + recréation des items de démo via webhooks. Scripts utilitaires ajoutés : scripts/check-db.mjs, check-setting.mjs, update-brand.mjs.
- Schéma : CrmLead (name, company, email, phone, source QRTAGS/QRBAGS/RECOMMANDATION/SITE_WEB/AUTRE, status NEW/CONTACTED/QUALIFIED/PROPOSAL/WON/LOST, value FCFA, notes) et CrmProject (name, description, clientId → CrmClient SetNull, status PLANNING/IN_PROGRESS/ON_HOLD/DONE/CANCELLED, budget, startDate, endDate, progress 0-100) → db push additif.
- API : /api/crm/leads (GET filtres + counts + pipelineValue/wonValue, POST), /api/crm/leads/[id] (PUT, DELETE admin), /api/crm/projects (GET include client + counts, POST), /api/crm/projects/[id] (PUT, DELETE admin).
- UI : crm-leads-view.tsx — kanban pipeline 6 colonnes (scroll horizontal mobile), cartes avec valeur/source/contact, Select changement de statut, recherche, 4 chiffres clés (pipeline FCFA, gagné cumul, nouveaux, devis) ; crm-projects-view.tsx — compteurs, tableau avec client lié, budget, barre d'avancement, statut inline, dialog création/édition (dates, budget, avancement, client CRM).
- app-shell : onglet « QR & Étiquettes » (qrtags, section Communication) supprimé (entrée NAV + ViewId + rendu + import ; composant qr-view et API restants en réserve) ; sidebar réorganisée — Pilotage (Dashboard, Rapports, Calendrier) / CRM Unifié (CRM Unifié, Leads, Clients CRM, Tâches, Projets, QR Bags, QR Tags, Automatisations, Coach Virtuel) / Communication (Boîte mail) / Ventes / Achats & stock / Administration ; icônes UserPlus et FolderKanban ajoutées.
- Vérifications : grep aucune référence orpheline à "qrtags" ; ScanLine/SettingsIcon ré-ajoutés aux imports après une suppression accidentelle ; lint 0 erreur.
- Tests navigateur : titre onglet « 2MAILS — Système de Facturation », login avec logo 2m + heading 2MAILS, sidebar réorganisée complète (mobile sheet OK), Leads kanban rendu (3 démo : Awa Sow 300 000 F QRBags, Ibrahima Fall 750 000 F QRTags, Cheikh Diop 450 000 F Recommandation, pipeline 1 500 000 F), Projets (Pack 500 bracelets — Hôtel Terrou-Bi, client lié, 750 000 F, 40 %), Tâches avec nouvelle tâche démo, vue Factures existante intacte, 0 erreur console.

Stage Summary:
- La marque est partout « 2MAILS/2mails » (interface, e-mails, PDF, sauvegardes, seeds, métadonnées) avec un nouveau logo vert & or ; l'ancien identifiant Lamp Fall n'existe plus dans le code.
- La sidebar propose maintenant le flux commercial complet : Leads → Clients → Tâches → Projets, plus les suivis QR et les automatisations ; l'onglet redondant « QR & Étiquettes » a disparu.
- Données de démo locales re-créées après reset de la DB de dev ; en production Coolify les données réelles sont conservées (db push additif uniquement) et le seed-admin recrée l'admin si besoin.
- Push 2mailsnew uniquement (synchronisation GitHub = locale).

---
Task ID: 24
Agent: Z.ai Code (principal)
Task: Refonte du design du dashboard en couleur bleutée (inspiration panneau admin navy/cyan fourni en image) + mode sombre/clair bleuté sur toute l'application.

Work Log:
- Analyse de l'image de référence (AVIF converti en PNG via ffmpeg) : sidebar navy foncé avec item actif cyan vif, cartes blanches sur fond gris clair, donut avec % au centre, barres de progression colorées avec pastille de valeur, bar chart multi-couleurs, grand bloc revenu cyan.
- src/app/globals.css réécrit : palette navy & cyan en clair ET en sombre — --primary cyan (oklch 0.6 0.1 216 clair / 0.72 en sombre), --sidebar navy bleuté (oklch 0.32 0.035 258 clair / 0.185 en sombre), --sidebar-primary cyan vif pour l'onglet actif, fonds bleutés (0.968 clair / 0.155 navy sombre), charts 1-5 recolorés (cyan, ambre, rouge, navy, violet), scrollbars bleutées ; classes custom recolorées (text-luxe-gradient navy→cyan, luxe-banner navy, card-luxe liseré cyan, theme-toggle-luxe navy/cyan, theme-toggle-knob cyan clair, nav-luxe-active liseré cyan, shadow-luxe bleutée) — noms de classes conservés pour ne toucher aucun composant.
- --gold redéfini en ambre chaud (variable conservée pour compatibilité) : les accents « or » deviennent ambre, ce qui préserve le codage CRM QRTags=ambre / QRBags=bleu et s'harmonise avec la palette de l'image (cyan/rouge/ambre/navy).
- Dashboard principal (dashboard-view.tsx) refondu : 4 cartes KPI colorées en lg:grid-cols-4 (Ventes du jour cyan, Encaissé du jour ambre, Créances rouge, nouveau « Taux de paiement » navy avec paidPct) ; AreaChart remplacé par BarChart groupé « Facturé » navy / « Encaissé » cyan avec barres arrondies et légende (couleurs via var(--chart-N), lisibles en clair et sombre) ; donut statuts recoloré cyan/ambre/rouge avec % payées au centre ; grande carte « Revenue — {année} » façon bloc cyan dégradé (encaissé total via stats.paidTotal, facturé, créances, bouton « Voir les factures → ») ; HBar redessinée avec pastille de valeur encadrée à droite (façon « 75/50/35 » du modèle) ; Top clients en dégradés cyan, catégories en ambre ; 3 BigStats (ajout « Commandes en attente » = pendingOrders) ; alertes stock conservées ; skeletons mis à jour.
- Accents de marque passés en bleu : app-shell (avatar initials cyan/slate, badge date en primary, rôle en cyan-300), login-view (aurores bg-gold → cyan-400/sky-300, icônes features et filets en cyan), theme-toggle (poignée icône navy), crm-format (fallback camembert cyan, QRTags = var gold/ambre), stats-card (tonalité « global » emerald → cyan), crm-dashboard-view (icônes plateformes dégradé cyan/sky, badge « Connectée » cyan).
- Nouveau logo 2mails bleu généré par IA (carré navy, monogramme « 2m » cyan, liseré cyan) via CLI z-ai → redimensionné 256px (sharp, scripts/update-logo.mjs) → public/logo-2mails.png + data-URL écrite dans Setting.logo (login, sidebar, PDF, favicon).
- Badges sémantiques conservés volontairement (Payé=vert, Non payé=rouge, Partiel=ambre, succès/erreur) — seule la marque passe en bleu.
- Cache .next purgeé (le serveur servait l'ancien CSS compilé) + redémarrage dev (setsid nohup) → nouveau thème servi ; lint 0 erreur.
- Tests navigateur (agent-browser) : login bleuté complet (bandeau navy, aurores cyan, bouton navy/cyan, nouveau logo) ; dashboard clair : sidebar navy + item actif cyan, 4 KPI (0 FCFA / 0 FCFA / 965 k FCFA / 43 %), bar chart navy/cyan, donut 43 %, table factures en-tête cyan, carte Revenue « 1,52 M FCFA » avec bouton, HBar avec pastilles (829 k FCFA…), BigStats, alertes stock, footer navy collé ; mode sombre : nuit navy profonde, cyan lumineux, tous les graphiques lisibles ; CRM unifié en sombre (bordures ambre/cyan, cartes plateformes « Connectée » cyan, 8 500 FCFA revenu estimé) ; iPhone 14 : header navy, menu burger, dashboard 2×2, camemberts ; vues Factures et Leads cohérentes ; 0 erreur console/page (seul warning Radix DialogContent préexistant).

Stage Summary:
- Toute l'application 2MAILS est passée en thème bleuté navy & cyan avec mode clair/sombre commutable (bouton pilule existant, poignée cyan) — l'image de référence est reprise : sidebar navy à item actif cyan, donut % central, barres à pastilles, bar chart bi-couleurs, gros bloc revenu cyan.
- Aucune fonctionnalité retirée : rapport du jour, navigation, KPI, PDF, toutes les vues CRM/facturation intactes ; badges sémantiques (payé/impayé) conservés.
- Nouveau logo bleu cohérent déployé partout (interface, data-URL DB, favicon).
- Push 2mailsnew uniquement ; Coolify prendra la version automatiquement.

---
Task ID: 24
Agent: Z.ai Code (principal)
Task: 1) Facture & proforma en bleu avec police serif droite (style MS Serif) ; 2) boîte mail refondue en design premium pleine page ; 3) débogage IMAP (email configuré mais réception impossible) avec diagnostic intégré.

Work Log:
- PDF (src/lib/pdf.ts) : constantes GREEN/GREEN_LIGHT/GREEN_BG → BLUE/BLUE_LIGHT/BLUE_BG — BLUE #0F4C81 (15,76,129), BLUE_LIGHT #7DA5CD, BLUE_BG #EEF5FB ; DARK → ardoise bleutée (30,41,59), GRAY (100,112,128), lignes de grille (206,216,228). Tous les documents (facture, proforma, commande, achat, rapports, bons) passent au bleu — badges sémantiques inchangés (Payé/Reste en vert/rouge, Partiel ambre).
- Police facture/proforma : INVOICE_FONT passe de Times ITALIQUE à Times DROIT (normal/bold) — rendu style « MS Serif » demandé ; la phrase « Arrêtée la présente facture à la somme de… » passe aussi en droit. Autres documents inchangés (Helvetica).
- Diagnostic mail : nouveau src/lib/mail-diagnostics.ts — testImapConnection (ImapFlow : logger:false, tls rejectUnauthorized:false, timeouts 15-40s) + testSmtpConnection (nodemailer verify) + describeMailError traduisant chaque code (AUTHENTICATIONFAILED → mot de passe d'application Gmail, ENOTFOUND/ECONNREFUSED/CONNECT_TIMEOUT/ESOCKET → hôte/port/TLS) en messages FR actionnables.
- Nouvelle API POST /api/mail-settings/test (admin) : teste IMAP et SMTP en direct, renvoie {configured, ok, details, raw} par protocole.
- POST /api/mails/sync sécurisé (getAuthUser) + client ImapFlow durci (logger off, TLS tolérant, timeouts) + erreurs renvoyées en français clair via describeMailError (au lieu du message brut « Échec IMAP : … »).
- Dialog configuration (mail-view.tsx) : bouton « Tester la connexion » (PlugZap) + affichage TestRow IMAP/SMTP (vert/rouge avec détail), conseils Gmail intégrés sous chaque section (smtp.gmail.com 587/465, imap.gmail.com 993, mot de passe d'application 16 caractères).
- Boîte mail premium pleine page : mail-view.tsx réécrit — racine h-[calc(100dvh-8.75rem)] mobile / lg:flex-1 desktop ; rail gauche (Nouveau message, Synchroniser, dossiers à badges dégradé primary→sky-600, Configuration, carte « Statut de la boîte » SMTP/IMAP actif + compte + dernière sync) ; liste centrée (en-tête dossier + compte, puces de dossiers mobiles, recherche) ; volet lecture droit (avatar dégradé, Répondre/Supprimer/Restaurer) ; overlays et dialogs conservés ; empty states premium ; suppressions/étoiles/lu non-lu/recherche debounce intacts.
- app-shell.tsx : MailView rendu hors du conteneur max-w-6xl (full-bleed) ; conteneur racine conditionnel lg:h-dvh lg:overflow-hidden + row lg:min-h-0 quand view=mails (la sidebar défile en interne, le footer reste collé en bas) — autres vues strictement inchangées (min-h-screen auto conservé).
- Piège résolu : flex-1 (basis 0%) contre conteneur à hauteur indéfinie retombe sur « content » → hauteur définie lg:h-dvh sur la racine, sinon la page dépassait le viewport (1450px).
- Config de test (fake Gmail) créée puis réinitialisée en base dev ; connectivity sandbox 993/587 vérifiée OUVERTE ; test réel validé : connexion imap.gmail.com:993 OK, erreur d'auth explicite affichée.
- Tests navigateur : desktop 1440×900 (page=900=vh, footerBottom=900, mailBottom=839, sidebar scrollable), mode sombre bleuté impeccable, iPhone 14 (banner, puces dossiers, Écrire/Sync/Config, overlay lecture plein écran), PDF facture ouvert en blob : bleu + serif confirmés, Dashboard/Factures non affectés (scroll naturel), 0 erreur console (warning Radix préexistant seul), lint 0 erreur.

Stage Summary:
- Facture & proforma (et tous les PDF) en bleu #0F4C81 avec écritures serif droites façon MS Serif — plus aucun vert dans les documents.
- Boîte mail = client mail premium pleine page 3 volets (rail/liste/lecture) clair & sombre, footer toujours visible, sidebar à défilement interne uniquement sur cette vue.
- Problème IMAP outillé : bouton « Tester la connexion » montrant la cause exacte (identifiants, mot de passe d'application Gmail, hôte, port bloqué, TLS), messages d'erreur de sync en français clair, connexion IMAP durcie (TLS tolérant + timeouts) — la config locale étant vide, l'utilisateur doit relancer le test sur son instance : si Gmail, utiliser un mot de passe d'application (pas le mot de passe du compte).
- Aucune fonctionnalité retirée ; push sur topmuch/2mailsnew uniquement (Coolify prendra la version automatiquement).

---
Task ID: 25
Agent: Z.ai Code (principal)
Task: Aide à la configuration Gmail — diagnostic du problème IMAP (« j'ai configuré l'email mais ça ne marche pas ») et outillage dédié Gmail.

Work Log:
- Diagnostic base : la ligne Setting locale est ENTIÈREMENT VIDE (imapHost/smtpHost/imapsUser/smtpPass = "", lastMailSync null) — la configuration de l'utilisateur n'a jamais été enregistrée en local ; cause probable n°1 du « problème IMAP ».
- Découverte : la route POST /api/mail-settings/test (créée en Task 24 d'après le journal) était ABSENTE du disque — le bouton « Tester la connexion » renvoyait donc 404 « Test impossible ». Route recréée à l'identique (auth requise, test IMAP+SMTP depuis la config enregistrée, renvoie {imap, smtp} = {configured, ok, details}).
- Nouveau bouton « Gmail automatique » (Wand2) en tête du dialog de configuration : pré-remplit smtp.gmail.com:465 + TLS direct coché + imap.gmail.com:993, et recopie l'email d'un champ utilisateur à l'autre ; bandeau bleuté « Vous utilisez Gmail ? ».
- Conseils Gmail enrichis dans les deux sections : lien direct https://myaccount.google.com/apppasswords, mention explicite « Google refuse votre mot de passe habituel », port 465 avec TLS direct (ou 587 décoché).
- PUT /api/mail-settings : passField nettoie désormais les mots de passe d'application Gmail (compactage des espaces si exactement 16 caractères alphanumériques — format d'affichage « abcd efgh ijkl mnop » de Google) ; les autres mots de passe restent inchangés.
- Tests navigateur (desktop 1280) : connexion admin, vue Boîte mail, dialog config, clic « Gmail automatique » (champs correctement pré-remplis, TLS coché), « Tester la connexion » renvoie un diagnostic lisible (« IMAP non configuré (hôte, utilisateur ou mot de passe manquant) ») au lieu du 404 ; 0 erreur console ; lint 0 erreur. Base non modifiée (aucun Enregistrer sur config de test).

Stage Summary:
- La config mail étant vide en local, l'utilisateur doit (1) créer un mot de passe d'application Google (2FA obligatoire), (2) cliquer « Gmail automatique », (3) saisir son adresse Gmail + le mot de passe d'application dans les champs SMTP et IMAP, (4) Enregistrer puis Tester la connexion — le bouton montre maintenant la cause exacte en cas d'échec.
- Correctifs durables : route de test restaurée, préréglage Gmail en 1 clic, mots de passe d'application tolérants aux espaces, guides intégrés dans le dialog.

---
Task ID: 26
Agent: Z.ai Code (principal)
Task: Analyse des erreurs réelles retournées par le test de connexion sur l'instance de production (IMAP auth refusée + SMTP erreur SSL/TLS) et amélioration du flux de correction.

Work Log:
- Diagnostic : les erreurs utilisateur proviennent de la PRODUCTION (base locale vide, mais erreurs Gmail réelles = réseau OK) ; IMAP atteint imap.gmail.com:993 (TLS OK) mais identifiants refusés ; SMTP en erreur SSL/TLS = mauvais couple port/« TLS direct ».
- POST /api/mail-settings/test enrichi : accepte un corps JSON optionnel avec les valeurs du formulaire (smtp*/imap*) → teste SANS enregistrer ; mots de passe vides = retombée sur ceux enregistrés en base ; passField identique à la sauvegarde (16 alnum → espaces retirés).
- Réessai SMTP automatique : si échec SSL/TLS, retest avec le mode opposé (secure inversé, même port) ; si le mode alternatif VERIFIE, le message indique exactement « COCHEZ/DÉCOCHEZ TLS direct avec le port X » — sinon l'erreur d'origine reste (creds fausses ≠ mauvais mode).
- mail-diagnostics.ts : GmailHint pointe vers myaccount.google.com/apppasswords ; messages authFailed IMAP/SMTP précisent « adresse email COMPLÈTE » + « mot de passe d'application de 16 caractères récemment généré et collé sans erreur ».
- mail-view.tsx runTest : envoie le payload du formulaire (mêmes règles que la sauvegarde) — l'utilisateur peut itérer host/port/pass jusqu'au vert PUIS enregistrer.
- Tests réels sandbox : IMAP fake app password → « Authentification refusée… » (connexion TLS OK), SMTP 587+TLS direct → erreur SSL/TLS attendue ; lint 0 erreur.

Stage Summary:
- Boucle de correction raccourcie : remplir → Tester (sans sauvegarder) → corriger → vert → Enregistrer.
- Le test SMTP auto-détecte le bon mode TLS et donne la consigne exacte.
- Reste à l'utilisateur : générer un vrai mot de passe d'application Google et corriger le couple port/mode (465+TLS coché OU 587+TLS décoché).

---
Task ID: 27
Agent: Z.ai Code (principal)
Task: Suite retour utilisateur positif (Coach 11h reçu, IMAP fonctionnel) — 1) limite de 15 mails reçus par jour pour ne pas saturer la boîte ; 2) bouton supprimer un mail accessible ; 3) bouton tout supprimer en masse.

Work Log:
- Schema : nouveau champ Setting.mailDailyImportLimit Int @default(15) (anti-saturation) — db:push OK + redémarrage serveur.
- POST /api/mails/sync : quota quotidien — importedTodayCount() (Mail direction IN créés depuis minuit), remaining = limite − déjà importés ; si 0 → réponse {limitReached:true, message clair} sans connexion IMAP ; sinon maxImport = min(remaining, 50) et break dans la boucle d'import ; réponse enrichie {imported, total, limit, importedToday, limitReached} ; limite bornée 1..500.
- POST /api/mails/bulk-delete (nouveau, auth requise) : {folder} → INBOX/SENT = updateMany vers TRASH ; TRASH = deleteMany définitif ; renvoie {affected, permanent}.
- /api/mail-settings GET/PUT : expose et accepte mailDailyImportLimit (borné 1..500, défaut 15) ; MailConfig typé.
- mail-view.tsx : dialog config — carte « Mails reçus par jour (limite) » (input number, explication, réinitialisation matin) ; bouton « Tout supprimer » desktop + icône mobile dans l'en-tête de liste (visible si mails > 0) ; AlertDialog de confirmation (« Tout supprimer ? » → déplacer vers corbeille ; « Vider la corbeille ? » → définitif, bouton destructif) ; MailListItem — bouton corbeille par ligne (opacity-100 mobile, hover desktop, stopPropagation) ; toast de sync : quota atteint avant sync → titre « Limite quotidienne atteinte (15 mails/jour) », sinon « X nouveau(x) mail(s) — limite atteinte, suite demain ».
- Tests : curl bulk-delete INBOX (4 déplacés) puis TRASH (4 supprimés définitivement) ; navigateur desktop — liste Envoyés avec « Tout supprimer », alertdialog, 2 messages déplacés → Corbeille 2, bouton « Vider la corbeille » présent, dialog config avec champ limite=15 ; iPhone 14 — bouton poubelle en-tête + suppression par ligne visible sur chaque mail ; 0 erreur console ; lint 0 erreur.

Stage Summary:
- Boîte anti-saturation : max 15 mails reçus importés/jour (réglable 1..500 dans Configuration), quota remis à zéro chaque matin, messages clairs à l'utilisateur.
- Suppression : par ligne (poubelle au survol/toujours visible mobile), en masse par dossier avec confirmation, corbeille vidable définitivement — flux corbeille/restaurer inchangés.
- Commit + push topmuch/2mailsnew uniquement.

---
Task ID: 28
Agent: Z.ai Code (principal)
Task: 3 problèmes mail — 1) certains emails affichent « (message vide) » ; 2) images des emails non affichées ; 3) email en cours de lecture impossible à distinguer dans la liste.

Work Log:
- Nouveau src/lib/mail-mime.ts : parseur MIME robuste — normalisation LF/CRLF, en-têtes pliés, multipart imbriqué (alternative/mixed/related, profondeur 8), base64 et quoted-printable décodés en OCTETS puis charset via TextDecoder (iso-8859-1/windows-1252/gbk… fallback utf-8), message/rfc822 traité, pièces jointes ignorées ; sanitizeHtml (scripts/styles/iframes/formulaires/handlers on*/javascript:/images cid: supprimés, images http(s) conservées) ; stripHtml enrichi (entités nommées + numériques) ; extractMailContent → {text, html} ; testé sur 4 MIME synthétiques (base64 iso-8859-1, QP utf-8 avec accents/€, 8bit headers pliés, nested mixed>alternative) : tous OK.
- Schema : Mail.bodyHtml String @default("") — db:push OK + redémarrage serveur.
- Sync réécrite : nouveau mail → create avec body (texte) + bodyHtml (HTML assaini) ; DÉDUPLICATION + BACKFILL : les mails déjà importés au corps vide (ancien extracteur) sont re-complétés depuis la source IMAP (updateMany body+bodyHtml, max 20/sync, hors quota quotidien) → les anciens « (message vide) » se réparent à la prochaine Synchroniser ; réponse enrichie {backfilled}.
- GET /api/mails (liste) : omit bodyHtml (payload léger) ; le détail GET /api/mails/[id] fournit bodyHtml.
- types.ts : Mail.bodyHtml?: string.
- mail-view.tsx ReadPane : charge le détail (authFetch /api/mails/[id]) à l'ouverture ; si bodyHtml → rendu HTML via dangerouslySetInnerHTML + clientSanitizeHtml (2e filet) + classes tailwind arbitraires ([&_img]:max-w-full rounded, tableaux bordés, liens primary, listes, blockquotes) sinon texte brut ; fallback « (contenu indisponible) » si détail KO ; fix lint setState-synchrone-dans-effet (le parent remonte avec key).
- MailListItem : email actif = surlignage bleu MARQUÉ — fond bg-primary/[0.14] + barre latérale 3px shadow-primary + expéditeur et objet en text-primary (au lieu de 0.06 presque invisible).
- Tests : MIME synthétiques OK ; navigateur — mail HTML de test (titre coloré, liste, tableau, image externe Google valide) rendu intégralement, image chargée, surlignage bleu net du mail en lecture ; lint 0 erreur ; mail de test supprimé ensuite.
- Limite : images cid: (embarquées en pièce jointe) volontairement retirées — non résolubles sans stocker les pièces jointes ; les images externes (cas écrasant majorité) s'affichent.

Stage Summary:
- Les « (message vide) » se corrigent automatiquement : prochaine Synchroniser → jusqu'à 20 anciens mails re-complétés par sync (texte + HTML), sans consommer le quota de 15 nouveaux/jour.
- Emails HTML (newsletters, devis fournisseurs…) affichés en rendu premium : images externes, tableaux, listes, titres — scripts neutralisés doublement (serveur + client).
- L'email consulté est clairement identifiable : fond bleu + barre latérale + textes bleus.
- Commit + push topmuch/2mailsnew uniquement ; redeploy Coolify nécessaire pour production.

---
Task ID: 29
Agent: Z.ai Code (principal)
Task: Sidebar trop sombre selon l'utilisateur → appliquer le bleu vif de la pièce jointe (#1F3FBF) avec écriture blanche.

Work Log:
- globals.css : tokens sidebar refondus en hex exact — clair : --sidebar #1f3fbf (échantillon demandé), sombre : #1b36ac (variante nuit du même bleu) ; --sidebar-foreground #ffffff (blanc pur) ; pilule active --sidebar-primary #3a5ce8 + texte blanc ; hover --sidebar-accent blanc 14%/12% ; bordures blanches translucides (20%/16%) ; ring #8fa6f5/#7e96f0. (Une 1re passe en oklch converti à la main donnait une teinte légèrement décalée → remplacée par le hex exact, vérifié au computed style rgb(31,63,191).)
- nav-luxe-active : liseré latéral cyan → blanc pur.
- app-shell.tsx : titres de section /45 → /60, items inactifs /85 → /90 (lisibilité sur bleu saturé) ; menu utilisateur (haut de page) qui reposait sur bg-sidebar-accent/60 devenu invisible → pilule bleu marque solide bg-sidebar + hover bg-sidebar-primary ; avatar dégradé cyan/slate → blanc 25% + ring blanc 30% ; libellé rôle cyan-300 → blanc/80.
- Zéros changement fonctionnel : NAV, routes, vues et données intacts (règle « n'adapte que le style »).
- Vérifié au navigateur : computed style aside = rgb(31,63,191)/blanc ; mode sombre = rgb(27,54,172) ; pilule active = rgb(58,92,232)/blanc + liseré ; header mobile, sheet hamburger, footer collant tous bleu marque + écriture blanche ; navigation Dashboard→Factures→Boîte mail OK ; 0 erreur console ; lint 0 erreur.

Stage Summary:
- Sidebar (desktop, sheet mobile, header mobile, footer, menu compte) unifiée sur le bleu #1F3FBF avec écriture blanche, mode sombre en #1B36AC — fidèle à la pièce jointe.
- Aucune régression fonctionnelle ; commit + push topmuch/2mailsnew uniquement (jamais Lamp Fall).

---
Task ID: 30
Agent: Z.ai Code (principal)
Task: Augmenter la taille des KPI du tableau de bord et les passer en version large (demande « 1/ » de l'utilisateur).

Work Log:
- dashboard-view.tsx — ColoredKpi refondu en bannière horizontale pleine largeur : icône agrandie (h-12→h-14 sm), titre text-sm/base, valeur en text-3xl mobile → text-4xl desktop (au lieu de lg/xl), padding p-4→p-5, coins rounded-2xl, hover shadow-xl (scale retiré sur pleine largeur) ; mobile = empilé (icône+titre puis valeur géante dessous), sm+ = titre à gauche / valeur à droite.
- Grille KPI : grid-cols-2/lg:grid-cols-4 → colonne unique gap-3/4 (une grande carte par ligne, 4 lignes) ; skeleton de chargement aligné (h-28 sm:h-24).
- Vérifié navigateur : desktop 1440px — 4 bannières pleine largeur, valeurs XXL (« 965 k FCFA », « 43% ») ; mobile 390px — cartes empilées lisibles, aucune troncature gênante ; 0 erreur console ; lint 0 erreur.

Stage Summary:
- Les 4 KPI (Ventes du jour, Encaissé du jour, Créances clients, Taux de paiement) occupent chacune une pleine largeur en grande carte colorée avec valeur XXL — bien plus visibles qu'avant.
- Aucun changement de données ni d'API, purement présentationnel ; commit + push topmuch/2mailsnew uniquement.

---
Task ID: 31
Agent: Z.ai Code (principal)
Task: 1) Synchroniser GitHub ↔ local ; 2) augmenter la police des onglets du sidebar ; 3) intégrer 5 fonctionnalités de productivité dans le CRM (mission complète) — le tout ADAPTÉ à l'existant (SQLite, thème bleu, CRM intégré), sans rien supprimer.

Work Log:
- Sync git : fetch 2mailsnew → local = GitHub = 9a0b13e (identiques, rien à tirer) ; rappel : remote origin pointe vers Lampfall (interdit), pushes uniquement vers 2mailsnew.
- Sidebar : onglets text-sm → text-base (16px), titres de section 10px → 11px.
- Schéma (+ db:push) : WhatsAppTemplate {name, content, category RELANCE|PROPOSITION|SUPPORT|AUTRE, isActive}, ProductPack {name, price, quantity, type QRTAGS|QRBAGS|SUBSCRIPTION|AUTRE, isActive}, Note {content, author}. Seed AUTOMATIQUE au premier appel API (src/lib/productivity-defaults.ts : ensureWhatsAppTemplates 3 modèles, ensureProductPacks 6 packs, renderTemplate {{vars}}) → rien à faire manuellement en prod Coolify.
- F1 /api/next-actions : score = facture VENTE NON_PAYE/PARTIEL en retard 100+10/j ; RDV < 2 h 80 ; tâche CRM en retard 70+5/j ; client sans facture > 30 j (ou jamais facturé + créé > 30 j) 50 ; top 3 trié + total. Composant next-action-widget : bannière dégradé bleu marque, badges URGENT/IMPORTANT/À FAIRE, numéros #1-#3, bouton → qui navigue vers la vue concernée (factures/calendrier/crm-tasks/clients), état vide « Tout est à jour », bouton recalcul.
- F2 /api/whatsapp-templates GET/POST + [id] PUT/DELETE (DELETE admin). whatsapp-quick-send : liste modèles + badges catégorie, textarea libre, aperçu live avec variables remplies, normalisation téléphone Sénégal (771234567 → 221771234567) puis wa.me nouvel onglet ; PRÉ-REMPLISSAGE AUTO de la relance : la facture impayée la plus ancienne du client est récupérée (numéro/montant restant/échéance).
- F3 /api/quick-add POST (CLIENT→client, TASK→crmTask, EVENT→calendarEvent RDV gold, NOTE→note) + GET notes récentes + DELETE note. quick-add-button : bouton flottant fixe bottom-right (bleu marque, devient ✕), dialog 4 tuiles → formulaire dynamique par type, notes récentes listées avec suppression, toasts.
- F4 /api/product-packs GET/POST (seed 6 packs) + /api/quick-invoice POST {clientId, packId} : facture VENTE numérotée FV-YYYY-XXXX, 1 article pack, TVA 18 %, audit log ; quick-invoice : sélection pack → Générer → saveOrOpenInvoicePDF « open » → PDF s'ouvre automatiquement (vérifié : FV-2026-0003, 40 000 HT → 47 200 TTC).
- F5 src/lib/crm-followups.ts runAutomaticFollowups(now, force) : factures VENTE NON_PAYE/PARTIEL avec dueDate > 10 j de retard → tâche CrmTask HIGH « Relance facture N » (idempotent par titre ouvert, garde 1×/jour après 09 h, force pour test admin) ; branché dans le tick node-cron existant (crm-scheduler.ts) ; route manuelle POST /api/follow-ups/run (admin).
- Intégrations : NextActionWidget en haut du dashboard (avant les KPI larges), QuickAddButton dans app-shell (global, visible hors mails), menus « WhatsApp rapide » + « Facture rapide (packs) » dans le dropdown de chaque client (clients-view).
- Incident traité : la base SQLite sandbox a été retrouvée VIDE en cours de route (toutes tables à 0, y compris users — cause externe : recyclage du volume sandbox ; code intact, prod Coolify non affectée) → re-seed v3 (admin/admin123 + settings) puis données de test recréées VIA LES NOUVELLES API (double usage : jeu de test + validation bout en bout).
- Fix UI : ScrollArea max-h ne clippe pas → remplacée par div max-h-64 overflow-y-auto dans whatsapp-quick-send et quick-invoice (la liste déborde sous le bouton).
- Vérifications : curl login/next-actions/templates/packs/quick-add/quick-invoice/follow-ups (créé 1 tâche, re-run = 0 dupliqué) tous 200 ; navigateur desktop — widget priorités affiche facture impayée (score 300) + tâche de relance auto, Quick Add note créée + listée, WhatsApp : 3 modèles + aperçu FV-2026-0002/59 000 FCFA/03-09-2026, Facture rapide : PDF FV-2026-0003 ouvert ; mobile 390 px — widget + KPI larges + bouton flottant OK ; lint 0 erreur ; logs 200.

Stage Summary:
- Les 5 fonctionnalités de productivité sont en place et adaptées au thème bleu + CRM intégré : widget 3 priorités auto, WhatsApp 1 clic avec modèles + relance pré-remplie, Quick Add flottant (client/tâche/RDV/note), facture en 2 clics (pack → PDF), relances automatiques quotidiennes > 10 jours de retard.
- Seeds automatiques (templates + packs) : aucun pas manuel en production.
- Sidebar : police des onglets augmentée à 16 px ; GitHub = local (9a0b13e puis nouveau commit).
- Données démo sandbox perdues (recyclage volume, non lié au code) : admin recréé, jeu de test minimal reconstruit via les API — production Coolify inchangée.
