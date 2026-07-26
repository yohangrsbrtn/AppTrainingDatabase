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
- **`aliments_coach`** : `{ id, nom, categorie, kcal_par_gramme, prot_par_gramme, glu_par_gramme, lip_par_gramme, created_at }` — bibliothèque d'aliments du coach, valeurs par gramme

### Mensurations

- **`mensurations`** : `{ id, client_id, date DATE, phase, poids NUMERIC, mesure NUMERIC, created_at }` — historique poids/mesure par client. Contrainte `UNIQUE(client_id, date)`. Upsert via `?on_conflict=client_id,date`.

### Coach

- **`notes_coach`** : notes libres par client, CRUD simple
- **`bilan_snapshots`** : données de progression/poids client

## Pages console (`console.html`)

### Mensurations (`state.nav='mensurations'`)

`renderMensurationsPage(el)` — dropdown client → charge depuis Supabase `mensurations` via `chargerMensurationsSupabase(clientId)`. Bouton "⬇ Migrer depuis GAS" → appelle `migrerMensurations(clientId, true)`.

### Migration (`state.nav='migration'`)

`renderMigrationPage(el)` — outil de migration GAS production → Supabase. **Toujours lit le GAS prod**, jamais le sandbox.

- **Profils connus** (`PROFILS_CONNUS`) : upsert `yohanp` et `perrineayot` dans `client_profils`.
- **Mensurations** : bouton par client → `migrerMensurations(clientId)` → `apiGasProd('chargerMensurations', clientId)` → insert dans `mensurations`.
- **`GAS_PROD_URL`** : URL du GAS de production, codée en dur dans `console.html`, distincte du `GAS_URL` du sandbox.
- **`GAS_ID_MAP`** : mapping ID Supabase → ID GAS quand ils diffèrent. Ex : `{ 'yohanp': 'yohan' }` — le compte test supabase-only lit la feuille `yohan` dans GAS.
- **`apiGasProd(action, clientId, params)`** : variante de `apiAs` qui appelle `GAS_PROD_URL` et applique `_gasId()`.

## Fiche client (`console.html`)

Page dédiée dans `#main`. `openPanel(id)` → `state.nav='fiche-client'`. Charge en parallèle (Promise.all) : profil, tous les programmes assignés, toutes les diètes assignées, progression, notes. `ficheData = { loaded, profil, tous_programmes, programme (actif), tous_dietes, diete (active), progression, notes }`.

**5 onglets** (state `ficheTab`) : `'profil'` | `'programmes'` | `'diete'` | `'progression'` | `'notes'`. `setFicheTab(tab)` re-rend uniquement `#ficheTabContent` sans recharger les données.

**Onglet Programmes** (`renderFicheProgTab`) : liste tous les `client_programmes` triés par date desc. Bouton toggle actif/inactif (`toggleProgrammeActif`). Clic sur une ligne → `ouvrirLogsProgramme(progId)` → `state.nav='prog-logs'`.

**Page logs programme** (`state.nav='prog-logs'`) : `chargerProgrammeById(progId)` charge l'arbo + logs complets. Navigation par semaine (`progLogsSemaine`). Back → `retourFicheClient()`. Sidebar garde "Clients" actif aussi pour `'prog-logs'`.

**Onglet Diète** (`renderFicheDieteTab`) : diète active + historique, toggle (`toggleDieteActif`), bouton "Assigner" → `ouvrirAssignerDiete(clientId)` (charge `dieteTemplatesData` si null, modal de sélection template).

## Base alimentaire (`console.html`, `state.nav='base'`)

`renderBasePage(el)` → async, charge `alimentsCoachData` (lazy) puis appelle `renderBaseSub(el)`. Deux onglets source :

- **Ma base coach** : liste `aliments_coach` (Supabase), recherche sans rechargement DOM via `_majTableCoach()` (met à jour uniquement `<tbody id="alim-tbody-coach">`). CRUD : `ouvrirFormulaireAliment`, `sauvegarderAlimentCoach`, `supprimerAlimentCoach`.
- **Open Food Facts** : recherche via `rechercherOpenFoodFacts(q)` (CGI endpoint `sort_by=unique_scans_n&lc=fr`), résultats dans `#offBaseResults` uniquement (pas de re-render page). Import unitaire via `importerOFFDansBase`.

**Import depuis Sheets** : bouton "⬇ Importer depuis Sheets" → `lancerImportSheets()` appelle `api('chargerBaseAliments')` (GAS sandbox), affiche modal de confirmation, puis `executerImportSheets()` insert par lots de 50 avec `resolution=ignore-duplicates`. **Piège** : ne jamais passer les données en `onclick` inline — utiliser `window._importCoach` / `window._importCommunaute` (guillemets JSON cassent l'attribut HTML).

**Variables d'état** : `alimentsCoachData` (null=pas chargé), `alimentsCoachErr`, `alimBaseSearch`, `alimBaseCat`, `alimBaseSource` ('coach'|'off'), `alimOffResults`, `ajoutAlimTab`, `ajoutAlimRI`.

## Page Diètes coach (`console.html`)

`state.nav='dietes'` → `renderDietesPage(el)`. Charge `dieteTemplatesData` (lazy) via `chargerDieteTemplates()` — nested select `diete_templates → repas → repas_aliments`.

**Éditeur de template** (`ouvrirEditeurDiete(id)`) : modal, repas + aliments avec macros saisies par 100g (converties en par gramme en DB). Sauvegarde = upsert template + delete cascade repas + réinsertion séquentielle (repas un par un pour récupérer les IDs).

**Assignation** : `ouvrirAssignerDieteTemplate(tplId, nom)` (depuis la page Diètes) ou `ouvrirAssignerDiete(clientId)` (depuis l'onglet Diète de la fiche). `assignerDieteAuClient` : PATCH actif=false sur les précédentes + POST nouvelle entrée dans `client_dietes`.

**Voir les assignés** : bouton 👥 sur chaque template (programme et diète) → modal `ouvrirAssignesTemplate` / `ouvrirAssignesDiete` — requête par `nom` sur `client_programmes`/`client_dietes`.

**Schéma Supabase (diètes + base alimentaire)** à créer si absent :
```sql
CREATE TABLE IF NOT EXISTS diete_templates (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS repas (id SERIAL PRIMARY KEY, template_id INTEGER REFERENCES diete_templates(id) ON DELETE CASCADE, nom TEXT NOT NULL, ordre INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS repas_aliments (id SERIAL PRIMARY KEY, repas_id INTEGER REFERENCES repas(id) ON DELETE CASCADE, nom TEXT NOT NULL, quantite_g NUMERIC NOT NULL DEFAULT 0, kcal_par_gramme NUMERIC, prot_par_gramme NUMERIC, glu_par_gramme NUMERIC, lip_par_gramme NUMERIC, ordre INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS client_dietes (id SERIAL PRIMARY KEY, client_id TEXT NOT NULL, nom TEXT, actif BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS aliments_coach (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, categorie TEXT, kcal_par_gramme NUMERIC NOT NULL DEFAULT 0, prot_par_gramme NUMERIC NOT NULL DEFAULT 0, glu_par_gramme NUMERIC NOT NULL DEFAULT 0, lip_par_gramme NUMERIC NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
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
- **`alimentsCoachData`** : lazy-loadé (null jusqu'au premier accès). Chargé automatiquement à l'ouverture de la page Base alimentaire ou du modal d'ajout d'aliment (onglet "Base coach"). Toujours vérifier `=== null` avant usage.
- **Open Food Facts** : requête à la demande via `rechercherOpenFoodFacts(q)`. Les macros retournées sont déjà par gramme (÷100 appliqué). Ne jamais faire d'import en masse.
- **Modal ajout aliment** : 3 onglets — "Base coach" (recherche `alimentsCoachData`), "Open Food Facts" (fetch ON OFF), "Manuel" (saisie libre). État dans `ajoutAlimTab` et `ajoutAlimRI`. `_ouvrirSaisieQuantite()` est le point d'entrée commun après sélection base/OFF.
- **Import Sheets (onclick inline)** : ne jamais injecter `JSON.stringify(data)` dans un attribut `onclick` — les guillemets cassent l'HTML. Stocker dans `window._var` et référencer dans l'onclick.
- **Deux GAS distincts** : `api.js` pointe vers le GAS sandbox (`AKfycbxU...`). Les migrations lisent toujours `GAS_PROD_URL` (`AKfycbwQ...`) via `apiGasProd()`. Ne pas mélanger.
- **`GAS_ID_MAP`** : `yohanp` est un compte supabase-only sans feuille GAS — il mappe vers `yohan` pour toute lecture GAS. Ajouter ici tout nouveau client test sans feuille propre.

## Workflow

- Push git sans demander confirmation.
- Tout développement se fait **uniquement ici**, pas dans AppTrainingPWA.
- Tester avec le compte `yohanp` (marqué `supabase_only=true` dans `client_profils`).
- Avant portage d'une fonctionnalité, relire `../AppTraining/Code.js` pour comprendre la logique GAS existante.
