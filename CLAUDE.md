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

Page dédiée dans `#main`. `openPanel(id)` → `state.nav='fiche-client'`. Charge en parallèle (Promise.all) : profil, tous les programmes assignés, toutes les diètes assignées, progression, notes. `ficheData = { loaded, profil, tous_programmes, programme (actif), tous_dietes, diete (active), progression, notes }`.

**5 onglets** (state `ficheTab`) : `'profil'` | `'programmes'` | `'diete'` | `'progression'` | `'notes'`. `setFicheTab(tab)` re-rend uniquement `#ficheTabContent` sans recharger les données.

**Onglet Programmes** (`renderFicheProgTab`) : liste tous les `client_programmes` triés par date desc. Bouton toggle actif/inactif (`toggleProgrammeActif`). Clic sur une ligne → `ouvrirLogsProgramme(progId)` → `state.nav='prog-logs'`.

**Page logs programme** (`state.nav='prog-logs'`) : `chargerProgrammeById(progId)` charge l'arbo + logs complets. Navigation par semaine (`progLogsSemaine`). Back → `retourFicheClient()`. Sidebar garde "Clients" actif aussi pour `'prog-logs'`.

**Onglet Diète** (`renderFicheDieteTab`) : diète active + historique, toggle (`toggleDieteActif`), bouton "Assigner" → `ouvrirAssignerDiete(clientId)` (charge `dieteTemplatesData` si null, modal de sélection template).

## Page Diètes coach (`console.html`)

`state.nav='dietes'` → `renderDietesPage(el)`. Charge `dieteTemplatesData` (lazy) via `chargerDieteTemplates()` — nested select `diete_templates → repas → repas_aliments`.

**Éditeur de template** (`ouvrirEditeurDiete(id)`) : modal, repas + aliments avec macros saisies par 100g (converties en par gramme en DB). Sauvegarde = upsert template + delete cascade repas + réinsertion séquentielle (repas un par un pour récupérer les IDs).

**Assignation** : `ouvrirAssignerDieteTemplate(tplId, nom)` (depuis la page Diètes) ou `ouvrirAssignerDiete(clientId)` (depuis l'onglet Diète de la fiche). `assignerDieteAuClient` : PATCH actif=false sur les précédentes + POST nouvelle entrée dans `client_dietes`.

**Voir les assignés** : bouton 👥 sur chaque template (programme et diète) → modal `ouvrirAssignesTemplate` / `ouvrirAssignesDiete` — requête par `nom` sur `client_programmes`/`client_dietes`.

**Schéma Supabase (diètes)** à créer si absent :
```sql
CREATE TABLE IF NOT EXISTS diete_templates (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS repas (id SERIAL PRIMARY KEY, template_id INTEGER REFERENCES diete_templates(id) ON DELETE CASCADE, nom TEXT NOT NULL, ordre INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS repas_aliments (id SERIAL PRIMARY KEY, repas_id INTEGER REFERENCES repas(id) ON DELETE CASCADE, nom TEXT NOT NULL, quantite_g NUMERIC NOT NULL DEFAULT 0, kcal_par_gramme NUMERIC, prot_par_gramme NUMERIC, glu_par_gramme NUMERIC, lip_par_gramme NUMERIC, ordre INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS client_dietes (id SERIAL PRIMARY KEY, client_id TEXT NOT NULL, nom TEXT, actif BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());
```

## Pièges connus

- **`data.clients` exclut systématiquement `yohan`** — pour le modal d'assignation, `yohan` est ajouté manuellement en tête de liste
- **`assignerTemplateAuClient`** : toujours vérifier que `templatesData` est chargé avant `.find()` — null si on n'est pas passé par la page Programmes. Ne pas passer `source_template_id` dans l'INSERT (colonne absente de `client_programmes`).
- **`templatesData === null` / `dieteTemplatesData === null`** — données lazy-loadées, toujours vérifier avant usage
- **Règle permanente : `font-size` ≥ 16px** sur tout `input`/`textarea`/`select` — Safari iOS zoome au focus sinon
- **`supaHeaders(extra)`** — toujours passer `{ Prefer: 'return=representation,resolution=merge-duplicates' }` pour les upserts
- **Nested select Supabase** : les filtres d'ordre sur les tables imbriquées s'écrivent `&table_enfant.order=colonne.asc` dans le query string
- **Un seul programme actif / une seule diète active** par client — assigner un nouveau doit d'abord passer l'ancien à `actif=false`
- **Logs jamais supprimés** — upsert uniquement, l'historique par semaine est permanent
- **`client_profils`** (avec 's') — ne pas confondre avec `client_profiles` (table de la PWA production qui s'écrit avec 'es')
- **Le client ne peut pas modifier son programme** — `programme-client.js` est lecture seule.
- **Voir les assignés** utilise `nom=eq.` sur `client_programmes`/`client_dietes` — si deux templates ont le même nom, les résultats seront mélangés.

## Workflow

- Push git sans demander confirmation.
- Tout développement se fait **uniquement ici**, pas dans AppTrainingPWA.
- Tester avec le compte `yohanp` (marqué `supabase_only=true` dans `client_profils`).
- Avant portage d'une fonctionnalité, relire `../AppTraining/Code.js` pour comprendre la logique GAS existante.
