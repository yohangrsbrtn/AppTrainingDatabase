# AppTrainingDatabase (Sandbox Supabase-only)

Bac à sable de développement pour la migration de l'app de coaching vers Supabase. **Tout le développement se fait ici d'abord.** Une fois fonctionnel, migration vers AppTrainingPWA (production).

- **URL live** : https://yohangrsbrtn.github.io/AppTrainingDatabase/
- **Supabase** : `https://sfacjbwiczwkcjpwneyg.supabase.co` — RLS ouverte à `anon`, pas d'auth Supabase pour l'instant
- **Référence fonctionnelle** : `../AppTraining/Code.js` et `../AppTraining/Index.html` (GAS) — comportement cible
- **Production** : `../AppTrainingPWA/` — référence lecture seule, ne pas modifier

## Déploiement

- Push sur `main` = déploiement automatique (GitHub Pages). Pousser après chaque modification, sans demander confirmation.
- Repo : `https://github.com/yohangrsbrtn/AppTrainingDatabase.git`

## Objectif en cours

**Reconstruire toute l'app cliente** (index.html + fichiers JS) pour qu'elle fonctionne 100% Supabase, sans GAS. Chaque action client doit écrire dans Supabase. Référence visuelle et fonctionnelle : `../AppTrainingPWA/` et `../AppTraining/Index.html`.

Le compte test est `yohanp` (`supabase_only=true` dans `client_profils`). Tester systématiquement avec ce compte.

## Architecture

- `index.html` — app client : CSS, état global `S`, routage `setPage()`/`render()`, login, home GAS (`renderHome`) et home Supabase (`renderHomeSupabase`)
- `console.html` — tableau de bord coach (noir + or, sidebar, autonome). Lit `localStorage` (`at_coach`/`at_token`).
- `api.js` — helpers Supabase (`supaHeaders()`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- `programme-client.js` — page "Mon programme" côté client : **lecture seule** (logs charge/reps/RIR/commentaire via `pcSauverLog()`). ✅ Supabase-only opérationnel.
- `bilan.js` — page Bilan client. Appelle encore GAS → **à porter sur Supabase**.
- `training.js` — page Training client. Appelle encore GAS → **à porter**.
- `diete.js` — page Diète client. Appelle encore GAS → **à porter**.
- `mensurations.js` — page Mensurations client. Appelle encore GAS → **à porter** (table `mensurations` Supabase existe déjà).
- `recettes.js`, `progression.js`, `collection.js`, `coach.js`, `protocole.js` — autres pages, portage à faire.

## Schéma Supabase

### Clients et profils

- **`client_profils`** : `{ client_id PK, prenom, nom, date_naissance, email, supabase_only, date_debut, jour_bilan, taille_cm, objectif, updated_at }` — Upsert via `on_conflict=client_id`.

### Programmes (snapshot par client)

- **`client_programmes`** : `{ id, client_id, nom, actif, created_at }`
- **`client_programme_blocs`** → **`client_programme_seances`** → **`client_programme_exercices`** → **`client_programme_logs`**
- **`client_programme_logs`** : `{ client_programme_exercice_id, semaine, numero_serie, charge, reps, rir, commentaire }` — upsert `(client_programme_exercice_id, semaine, numero_serie)`

### Templates coach

- **`programme_templates`** → **`programme_blocs`** → **`programme_seances`** → **`programme_seance_exercices`**
- **`exercices`** : bibliothèque d'exercices coach

### Diète

- **`diete_templates`** → **`repas`** → **`repas_aliments`**
- **`client_dietes`** : `{ id, client_id, nom, actif, created_at }` — une seule active à la fois
- **`aliments_coach`** : `{ id, nom, categorie, kcal_par_gramme, prot_par_gramme, glu_par_gramme, lip_par_gramme }`

### Mensurations

- **`mensurations`** : `{ id, client_id, date DATE, phase, poids NUMERIC, mesure NUMERIC, created_at }` — UNIQUE(client_id, date). Upsert via `?on_conflict=client_id,date`.

### Bilans (à construire)

- **`bilans`** : à définir — structure inspirée de la feuille GAS Bilan. Probablement : `{ id, client_id, date_validation DATE, semaine_label, commentaire_alim, commentaire_jour, commentaire_activite, envoye_coach BOOL, coach_traite BOOL }` + tables liées pour jours/repas.

### Coach

- **`notes_coach`** : notes libres par client
- **`bilan_snapshots`** : données de progression/poids

## Pages console (`console.html`) — État

### Bilans ✅

Page refaite avec 2 onglets :
- **Récents** : À traiter + Traités 15 derniers jours. Lignes cliquables → détail bilan.
- **Historique** : liste clients → tous leurs bilans → détail complet.
- **Détail bilan** (`state.nav='bilan-detail'`) : stats résumé, suivi journalier 7j, évaluations repas, commentaires, bouton "Marquer traité".

### Migration (`state.nav='migration'`) ✅

Outil migration GAS prod → Supabase.
- **Prévisualisation** (`state.nav='migration-preview'`) : par client, 2 onglets (Dashboard profil, Mensurations avec sélection ligne par ligne). Onglet Bilans = placeholder.
- **`GAS_PROD_URL`** : URL GAS prod, distincte du GAS sandbox.
- **`GAS_ID_MAP`** : `{ 'yohanp': 'yohan' }` — mapping ID Supabase → ID GAS.
- **`apiGasProd(action, clientId, params)`** : lit toujours le GAS prod.

### Mensurations (`state.nav='mensurations'`) ✅

Dropdown client → charge Supabase. Bouton "⬇ Migrer depuis GAS".

### Fiche client (`state.nav='fiche-client'`) ✅

5 onglets : profil, programmes, diète, progression, notes.

### Pages coach opérationnelles ✅

Dashboard, Clients, Classement, Base alimentaire, Programmes, Diètes, Protocole.

## Pages cliente (index.html) — État

### ✅ Opérationnelles Supabase

- **Login supabase_only** : flux d'auth Supabase (verifierClientSupabase)
- **Home Supabase** (`renderHomeSupabase`) : affiche uniquement "Mon programme" pour l'instant
- **Mon programme** (`programme-client.js`) : lecture arborescence + logs charge/reps/RIR

### 🔧 À porter sur Supabase (appellent encore GAS)

- **Mensurations** : table `mensurations` existe → priorité haute, portage rapide
- **Ma diète** : `client_dietes` + `diete_templates` existent → priorité haute
- **Bilan** : logique complexe, schema Supabase à définir
- **Training/Séance** : dépend du bilan
- **Progression/Collection** : XP, niveaux, titres — à définir en Supabase
- **Recettes, Classement, Profil** : secondaires

## Pièges connus

- **`data.clients` exclut systématiquement `yohan`** — pour les modals d'assignation, `yohan` est ajouté manuellement
- **`assignerTemplateAuClient`** : vérifier `templatesData` chargé avant `.find()`.
- **Règle permanente : `font-size` ≥ 16px** sur tout `input`/`textarea`/`select` — Safari iOS zoome sinon
- **`supaHeaders(extra)`** — toujours `{ Prefer: 'return=representation,resolution=merge-duplicates' }` pour les upserts
- **Un seul programme actif / une seule diète active** par client
- **`client_profils`** (avec 's') ≠ `client_profiles` (table PWA prod avec 'es')
- **Deux GAS distincts** : `api.js` → GAS sandbox. Migrations → `GAS_PROD_URL` via `apiGasProd()`. Ne pas mélanger.
- **`GAS_ID_MAP`** : `yohanp` → `yohan` pour toute lecture GAS.
- **`chargerHistoriqueBilans(client)`** existe dans GAS → retourne `[{ligneTitre, semaine, date, dejaEnvoye}]`, newest first.
- **`chargerBilanParLigne(client, ligneTitre)`** → données complètes d'un bilan (jours, repas, commentaires).
- **Nested select Supabase** : filtres d'ordre sur tables imbriquées → `&table_enfant.order=colonne.asc` dans le query string.
- **`alimentsCoachData`** : lazy-loadé (null jusqu'au premier accès).
- **Voir les assignés** : utilise `nom=eq.` sur `client_programmes`/`client_dietes` — si deux templates ont le même nom, résultats mélangés.

## Workflow

- Push git sans demander confirmation.
- Tout développement **uniquement ici** (AppTrainingDatabase), pas dans AppTrainingPWA.
- AppTrainingPWA = référence lecture seule pour comprendre le comportement attendu.
- Tester avec `yohanp` (supabase_only).
- Avant portage d'une fonctionnalité, relire `../AppTraining/Code.js` pour la logique GAS et `../AppTrainingPWA/` pour l'UI cible.
