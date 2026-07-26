# AppTrainingDatabase (Sandbox Supabase-only)

Bac à sable de développement pour la migration de l'app de coaching vers Supabase. **Tout le développement se fait ici d'abord.** Une fois fonctionnel, migration vers AppTrainingPWA (production).

- **URL live** : https://yohangrsbrtn.github.io/AppTrainingDatabase/
- **Supabase** : `https://sfacjbwiczwkcjpwneyg.supabase.co` — RLS ouverte à `anon`, pas d'auth Supabase pour l'instant
- **Référence fonctionnelle** : `../AppTraining/Code.js` et `../AppTraining/Index.html` (GAS) — comportement cible
- **Production** : `../AppTrainingPWA/` — ne pas toucher pendant le développement sandbox

## Déploiement

- Push sur `main` = déploiement automatique (GitHub Pages). Pousser après chaque modification, sans demander confirmation.
- Repo : `https://github.com/yohangrsbrtn/AppTrainingDatabase.git`

## Architecture

- `index.html` — app client : CSS, état global `S`, routage `setPage()`/`render()`, accueil, login
- `console.html` — tableau de bord coach (noir + or, sidebar, autonome). Pages : Accueil, Clients, Bilans, Classement, Protocole, Base alimentaire, Programmes, Diètes, **Fiche client** (`state.nav='fiche-client'`). Lit `localStorage` (`at_coach`/`at_token`).
- `api.js` — helpers Supabase (`supaHeaders()`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- `programme-client.js` — page "Mon programme" côté client : **lecture seule** (pas d'ajout/suppression de séances ou exercices). Le client peut uniquement logger charge/reps/RIR/commentaire via `pcSauverLog()`.
- `bilan.js`, `training.js`, `diete.js`, `mensurations.js`, `recettes.js`, `progression.js`, `collection.js`, `coach.js`, `protocole.js` — une page par fichier (portage en cours vers Supabase-only)

## Schéma Supabase

### Clients et profils

- **`client_profils`** : `{ client_id PK, prenom, nom, date_naissance, email, supabase_only, date_debut, jour_bilan, taille_cm, objectif, updated_at }` — données coach éditables. Upsert via `on_conflict=client_id`. Le client est identifié par `client_id` (string court, ex: "yohanp").

### Programmes (snapshot par client)

- **`client_programmes`** : `{ id, client_id, nom, actif, created_at }` — un seul actif à la fois. Assigner un nouveau = passer l'ancien à `actif=false` (jamais supprimé, pour garder l'historique)
- **`client_programme_blocs`** → **`client_programme_seances`** → **`client_programme_exercices`** → **`client_programme_logs`**
- **`client_programme_logs`** : `{ client_programme_exercice_id, semaine, numero_serie, charge, reps, rir, commentaire }` — upsert sur `(client_programme_exercice_id, semaine, numero_serie)`, jamais écrasé

### Templates coach (structure maître)

- **`programme_templates`** → **`programme_blocs`** → **`programme_seances`** → **`programme_seance_exercices`**
- **`exercices`** : bibliothèque d'exercices coach

### Diète

- **`diete_templates`** → **`repas`** → **`repas_aliments`** — macros recalculées à l'affichage depuis `quantite_g × valeur_par_gramme`
- **`client_dietes`** : programme de diète assigné à un client

### Coach

- **`notes_coach`** : notes libres par client, CRUD simple
- **`bilan_snapshots`** : données de progression/poids client

## Fiche client (`console.html`)

Page dédiée dans `#main` (pas un panneau latéral). `openPanel(id)` → `state.nav='fiche-client'`. Charge en parallèle (Promise.all) : profil (`client_profils`), programme actif avec arbo complète + logs, progression, notes. `ficheData = { loaded, profil, programme, progression, notes }` — spinner tant que `loaded=false`. Sidebar garde "Clients" actif quand `state.nav==='fiche-client'`.

`chargerProgrammeActif(clientId)` charge :
1. Le `client_programmes` actif (limit 1)
2. L'arborescence complète via nested select : `client_programme_blocs → client_programme_seances → client_programme_exercices`
3. Tous les `client_programme_logs` pour ces exercice IDs, indexés par `${exerciceId}|${semaine}|${serie}`

`renderFicheProgDetail(prog)` affiche le programme complet en lecture seule dans la fiche coach avec sélecteur de semaine.

## Pièges connus

- **`data.clients` exclut systématiquement `yohan`** — pour le modal d'assignation, `yohan` est ajouté manuellement en tête de liste
- **`assignerTemplateAuClient`** : toujours vérifier que `templatesData` est chargé avant `.find()` — null si on n'est pas passé par la page Programmes
- **`templatesData === null`** check avant toute opération sur les templates — les données sont lazy-loaded
- **Règle permanente : `font-size` ≥ 16px** sur tout `input`/`textarea`/`select` — Safari iOS zoome au focus sinon
- **`supaHeaders(extra)`** — toujours passer `{ Prefer: 'return=representation,resolution=merge-duplicates' }` pour les upserts
- **Nested select Supabase** : les filtres d'ordre sur les tables imbriquées s'écrivent `&table_enfant.order=colonne.asc` dans le query string
- **Un seul programme actif** par client — assigner un nouveau programme doit d'abord passer l'ancien à `actif=false`
- **Logs jamais supprimés** — upsert uniquement, l'historique par semaine est permanent
- **`client_profils`** (avec 's') — ne pas confondre avec `client_profiles` (table de la PWA production qui s'écrit avec 'es')
- **Le client ne peut pas modifier son programme** — `programme-client.js` est lecture seule. Les boutons d'ajout/suppression de séances et exercices ont été retirés volontairement.

## Workflow

- Push git sans demander confirmation.
- Tout développement se fait **uniquement ici**, pas dans AppTrainingPWA.
- Tester avec le compte `yohanp` (marqué `supabase_only=true` dans `client_profils`).
- Avant portage d'une fonctionnalité, relire `../AppTraining/Code.js` pour comprendre la logique GAS existante.
