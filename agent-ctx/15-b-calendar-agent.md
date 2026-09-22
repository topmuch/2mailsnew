# Task 15-b — Sous-agent calendrier

## Fichiers créés (aucun fichier existant modifié)

1. `src/app/api/events/route.ts`
   - `GET /api/events?month=YYYY-MM` : événements du mois (défaut = mois courant), bornes UTC (1er jour 00:00 → dernier jour 23:59:59.999), tri `date asc, startTime asc`, retour `{ events: CalendarEvent[] }` (dates ISO).
   - `POST /api/events` : validation title (400 « Le titre est obligatoire »), date YYYY-MM-DD (400 « Date invalide »), date stockée `T12:00:00.000Z` (anti-décalage fuseau), color ∈ green|gold|orange|red (défaut green), type ∈ RDV|TACHE|RAPPEL (défaut RDV), startTime/endTime HH:mm sinon null → 201 `{ event }`.

2. `src/app/api/events/[id]/route.ts`
   - `PUT` : update partiel revalidé champ par champ (date reconvertie en midi UTC) → `{ event }`, 404 « Événement introuvable ».
   - `DELETE` : 200 `{ ok: true }`, 404 « Événement introuvable ».

3. `src/components/calendar-view.tsx` ('use client', export default `CalendarView`)
   - En-tête : « Calendrier » + sous-titre, boutons « Aujourd'hui » (outline) / « Nouvel événement » (primary).
   - Grille mensuelle lundi→dimanche (42 cellules UTC, `grid-cols-7`, h-24 lg:h-28), navigation ChevronLeft/Right + libellé fr-FR (Intl, timeZone UTC), jours adjacents atténués, jour courant `ring-2 ring-gold` + fond `bg-gold-soft/40` + numéro en badge circulaire vert.
   - Cellules : jusqu'à 3 pastilles (barre colorée + titre tronqué ≥sm, point coloré sur mobile), done = barré + opacité, « +N autre(s) » ; clic événement → détail (stopPropagation), clic cellule → création avec date pré-remplie (role=button + clavier).
   - Dialog détail : badges type/couleur/Fait, date longue FR + horaires « 10:00 – 11:30 », description, boutons Supprimer (destructive) / Fermer / Marquer fait-à faire (PUT toggle) / Modifier (bascule en formulaire).
   - Dialog création-édition : Titre*, Date, Début/Fin (time), Type (Select), Couleur (4 pastilles ring-gold si sélectionnée), Description (textarea) → POST/PUT + toast + refresh.
   - Panneau latéral (lg 320px) : « À venir » (6 prochains événements ≥ aujourd'hui, mois courant + 2 suivants fusionnés, « Rien à venir » si vide) + mini-stats du mois (RDV à venir / Tâches / Rappels).
   - Skeletons 42 cellules pendant le chargement, framer-motion fade-in, toasts via `useToast` (convention invoices-view), `authFetch` pour les mutations, thème vert & or.

## Notes pour l'intégration
- Câblage app-shell à faire par l'orchestrateur (fichiers existants intouchables pour cette tâche) ; `import CalendarView from "@/components/calendar-view"`.
- Aucune dépendance nouvelle ; utilise useFetch, useToast, shadcn/ui (badge, button, card, dialog, input, label, select, skeleton, textarea), lucide-react, framer-motion.
- Section worklog ajoutée en fin de `worklog.md` (Task ID: 15-b).
