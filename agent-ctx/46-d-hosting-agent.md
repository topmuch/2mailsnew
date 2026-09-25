# Task 46-d — Onglet Hosting (domaines & renouvellements)

Agent : full-stack-developer (46-d) · Statut : TERMINÉ · Lint 0/0 · Serveur 200

## Fichiers
- **Modifié** : `src/lib/hosting-notify.ts` (implémentation complète du stub), `src/components/app-shell.tsx` (4 touches chirurgicales : icône Globe importée, import HostingView, ViewId `| "hosting"`, entrée NAV Communication après mails, case de rendu).
- **Créés** : `src/app/api/hosting/route.ts`, `src/app/api/hosting/[id]/route.ts`, `src/components/hosting-view.tsx`.
- **Intacts** : prisma/schema.prisma, crm-scheduler.ts, mail-*, settings-view, next.config.ts, package.json.

## Comportements clés
1. **daysLeft calendariel Dakar** : parties Y-M-D comparées (Intl en-CA + Date.UTC), jamais timestamps bruts → pas de décalage horaire. Helpers exportés : `dakarDaysLeft`, `dakarDayKey`, `formatRenewalFr`, `buildHostingReminder`.
2. **Étapes 30/15/2/0** : au tick, l'étape la plus urgente atteinte & absente de `notifiedStages` déclenche UN e-mail (via `sendAutomationEmail` de crm-automation → SMTP Setting, destinataire CrmAutomationConfig.recipientEmail sinon Setting.email) ; succès → toutes les étapes atteintes sont marquées (pas de rattrapage en cascade) ; échec → retry au tick suivant (30 min) ; expiré → étape « 0 » une seule fois.
3. **Journal** `CrmSentMessage` type HOSTING, dedupeKey `hosting-<id>-<étape>-<Y-M-D renewal>` ; sur P2002 la ligne est mise à jour (FAILED → SENT possible) au lieu de crasher.
4. **PUT** : renewalDate changé ⇒ notifiedStages reset "" ; `{action:"notify"}` = rappel manuel immédiat (dedupeKey `manual-<Date.now()>`, notifiedStages intacts).
5. **UI** : stats (total / ≤30 j / expirés), table desktop + cards mobile, badges rouge/orange/ambre/jaune/vert, WhatsApp `wa.me` vert (chiffres seuls, message « Bonjour {client}, rappel : le domaine … — {nomSociete} »), désactivé + hint sans téléphone ; bouton « Rappel » manuel ; dialog complet + reset expliqué ; AlertDialog suppression ; skeletons + empty state.

## Vérifications faites
- curl CRUD complet + 401/400 ; PUT date → reset confirmé ; notify → FAILED journal manual-*.
- Cycle hosting-notify testé par script standalone (SUPPRIMÉ depuis) : échec {errors:1} sans throw ; succès via mini-SMTP local jetable {notified:1}, notifiedStages "30,15,2", idempotence 2e appel {notified:0}, journal unique et FAILED→SENT corrigé. SMTP remis vide après.
- Navigateur (session dédiée) : login, NAV Hosting après mails, badges J-25/« À jour »/J-5, URL wa.me interceptée sans navigation (exacte, %20 encodé), disabled sans téléphone, édition, suppression, mobile 390 px sans débordement.
- dev.log : GET /api/hosting 200, zéro erreur.

## En base (démo)
- `2mails.sn` (OVH, 15 000 FCFA, J+112, « À jour », client société + téléphone) et `terroubi.sn` (Hôtel Terrou-Bi, 18 000 FCFA, J-25 jaune, tel 221770123456). Jour J : 2026-09-25.

## Notes pour le principal
- Le bouton « Rappel » (notify manuel) marche dès que SMTP est configuré (Paramètres → Boîte mail) ; sinon toast « SMTP non configuré » + journal FAILED — comportement voulu.
- Les rappels automatiques ne partent QUE si le destinataire (Automatisations → e-mail, sinon Setting.email) contient un « @ ».
- agent-browser : penser à `--session` dédiée si un autre agent l'utilise en parallèle (le daemon est partagé).
