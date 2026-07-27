# AppTrainingDatabase (Sandbox Supabase-only)

Bac à sable de développement pour la migration de l'app de coaching vers Supabase. **Tout le développement se fait ici d'abord.** Une fois fonctionnel, migration vers AppTrainingPWA (production).

- **URL live** : https://yohangrsbrtn.github.io/AppTrainingDatabase/
- **Supabase** : `https://sfacjbwiczwkcjpwneyg.supabase.co` — RLS ouverte à `anon`, pas d'auth Supabase pour l'instant
- **Référence fonctionnelle** : `../AppTrainingPWA/` (GAS prod) — comportement cible. **Ne jamais lire `../AppTraining/`.**
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
- `diete.js` — page Diète client. ✅ Mode Supabase opérationnel (multi-diètes, repas équivalents swipeables, aliments migrés). Mode GAS encore actif pour les autres fonctions (menus, journal).
- `mensurations.js` — page Mensurations client. Appelle encore GAS → **à porter** (table `mensurations` Supabase existe déjà).
- `recettes.js` — page Recettes client. ✅ Mode Supabase opérationnel (lecture depuis table `recettes`).
- `progression.js`, `collection.js`, `coach.js`, `protocole.js` — autres pages, portage à faire.

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

- **`diete_templates`** : `{ id, nom, description, client_only BOOL DEFAULT false }` — `client_only=true` = diète privée créée pour un client spécifique (migration ou "+ Créer" sans cocher "template réutilisable"). Filtrée de la liste des templates réutilisables dans `chargerDieteTemplates()`.
- **`repas`** : `{ id, template_id, nom, ordre, variante_index INT DEFAULT 0 }` — repas avec même `(template_id, ordre)` mais `variante_index` différent = repas équivalents (swipeables côté client). FK column = **`template_id`** (pas `diete_template_id`).
- **`repas_aliments`** : `{ id, repas_id, nom, quantite_g, kcal_par_gramme, prot_par_gramme, glu_par_gramme, lip_par_gramme, ordre }` — les aliments migrés depuis GAS stockent leurs macros **directement** dans ces colonnes (pas de FK `aliments_coach`). `diete.js` lit `aliments_coach` en priorité, puis fallback sur les colonnes directes.
- **`client_dietes`** : `{ id, client_id, nom, actif, created_at }` — **plusieurs diètes actives simultanées** autorisées (Jour On, Jour Off, etc.). `actif=false` = archivée. Lien vers template via `nom` (pas de FK directe).
- **`aliments_coach`** : `{ id, nom, categorie, kcal_par_gramme, prot_par_gramme, glu_par_gramme, lip_par_gramme }`
- **`recettes`** : `{ id, nom, emoji, categorie, description, temps_prep_min, portions, kcal_par_portion, prot_par_portion, glu_par_portion, lip_par_portion, ingredients JSONB, etapes JSONB }` — éditables uniquement par le coach depuis console.html → onglet Recettes dans Diètes.

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

Prévisualisation + import depuis GAS prod. 5 onglets : infos | mensurations | diète | programme | bilans.
- **`GAS_PROD_URL`** : URL GAS prod, distincte du GAS sandbox.
- **`GAS_ID_MAP`** : `{ 'yohanp': 'yohan' }` — mapping ID Supabase → ID GAS.
- **`apiGasProd(action, clientId, params)`** : lit toujours le GAS prod.
- **Diète** : preview avec équivalences visibles, checkbox "Créer un template réutilisable" (décoché = `client_only=true`). Import **idempotent** : si le template existe déjà (même `nom`), supprime ses repas et les recrée ; ne duplique pas `client_dietes`. Crée template + repas + variantes (équivalences) + aliments + `client_dietes`. Ne désactive **pas** les diètes existantes (multi-diètes).
- **Programme** : prévisualisation exercices + logs par semaine (navigateur `‹ Sem X ›`, lazy-load par semaine via `_migLoadSemaineSeances`, cache `migPreviewSeancesCache`). Import structure (blocs/séances/exercices) + logs toutes semaines en parallèle par séance. **Attention** : exercices migrés n'ont pas d'`exercice_id` (juste `nom`) → lookup groupe musculaire par nom dans l'éditeur.

### Mensurations (`state.nav='mensurations'`) ✅

Dropdown client → charge Supabase. Bouton "⬇ Migrer depuis GAS".

### Fiche client (`state.nav='fiche-client'`) ✅

7 onglets : profil, programmes, diète, progression, notes, bilans, mensurations.
- **Programmes** : liste des programmes assignés, boutons "Éditer" / "Désactiver/Activer". Clic sur le nom → logs. "Éditer" → `editeur-client-prog`.
- **Diète** : liste toutes les diètes assignées (plusieurs simultanées OK), boutons "+ Assigner" / "+ Créer" / "Éditer" / "Retirer". "Éditer" charge le template par `nom` (sans filtre `client_only`) et ouvre l'éditeur ; après save, retour automatique sur la fiche.
- **Bilans** : lazy-load depuis Supabase (`_ficheBilans`), tableau cliquable → détail bilan avec nav prev/next.
- **Mensurations** : lazy-load depuis Supabase, graphique SVG poids + mesure + tableau.
- **`_ficheCreateClientId`** : clientId pour création nouvelle diète depuis fiche. **`_ficheEditClientId`** : clientId pour édition diète depuis fiche.

### Diètes (`state.nav='dietes'`) ✅

2 onglets :
- **Templates diète** : liste (`client_only=false` uniquement), éditeur en page dédiée
- **Recettes** : CRUD recettes coach (table `recettes` Supabase)

### Éditeur de diète (`state.nav='editeur-diete'`) ✅

Page dédiée (plus de modale). Ouverte depuis les templates ou la fiche client.
- `ouvrirEditeurDiete(id)` → depuis page Diètes
- `editerDieteClient(nom, clientId)` / `ouvrirCreerDietePourClient(clientId)` → depuis fiche client
- `_ficheEditClientId` / `_ficheCreateClientId` : contexte client en cours
- `_dietNavBack` : page de retour après save/cancel
- `retourDepuisEditeurDiete()` : gère le retour (fiche-client ou dietes)
- **Multi-ajout aliments** : le picker `modal-ajout-aliment` reste ouvert après chaque ajout. Flash "✓ ajouté", compteur `_ajoutAlimCount`. Bouton "✓ Terminer" pour fermer.
- `_updateAlimentsDom(ri)` : mise à jour partielle DOM (`#alim-list-${ri}`) sans re-render de la page. Utilisée par `supprimerAlimentDiete` et la confirmation d'ajout.

### Éditeur programme client (`state.nav='editeur-client-prog'`) ✅

Ouvert depuis fiche client → onglet Programmes → bouton "Éditer".
- `ouvrirEditeurProgrammeClient(progId)` : charge le programme + exercicesData, construit `clientProgEnEdition`
- Même UI que l'éditeur de templates (blocs, séances, drag & drop, picker)
- Groupe musculaire affiché sous chaque exercice ; fallback lookup par nom si `exercice_id` null (programmes migrés)
- Répartition des séries par groupe musculaire (barres proportionnelles, via `renderRepartitionInto`)
- Save : PATCH champ par champ sur items existants (préserve les logs), INSERT pour nouveaux, DELETE pour supprimés
- État : `clientProgEnEdition`, `_origClientProgBlocIds/SeanceIds/ExoIds`, `_cpPickerCible`, `_cpDragExoSource`

### Logs programme (`state.nav='prog-logs'`) ✅

- **Vue semaine** : logs par série, groupe musculaire sous chaque exercice
- **Vue progression** : graphe SVG charge max par semaine par exercice + delta
- Bouton "Éditer" → `editeur-client-prog`
- `_progLogsView` : `'semaine'` | `'progression'`
- `exercicesData` chargé en parallèle avec le programme dans `ouvrirLogsProgramme`

### Éditeur templates programmes (`state.nav='programmes'` → onglet Templates) ✅

- Groupe musculaire affiché sous chaque exercice dans les lignes d'exercice
- Répartition séries par groupe musculaire (panel sous les blocs, `renderRepartition()` appelé en fin de `renderBlocsTemplate()`)

### Pages coach opérationnelles ✅

Dashboard, Clients, Classement, Base alimentaire, Bilans, Mensurations, Protocole.

## Pages cliente (index.html) — État

### ✅ Opérationnelles Supabase

- **Login supabase_only** : flux d'auth Supabase (`verifierClientSupabase`)
- **Home Supabase** (`renderHomeSupabase`) : affiche "Mon programme"
- **Mon programme** (`programme-client.js`) : arborescence blocs/séances, logs charge/reps/RIR, chrono, semaine selector
- **Ma diète** (`diete.js`) : multi-diètes (Jour On/Off…), repas équivalents swipeables, aliments migrés (fallback colonnes directes)
- **Recettes** (`recettes.js`) : liste + détail depuis table `recettes` Supabase

### 🔧 À porter sur Supabase (appellent encore GAS)

- **Mensurations** : table `mensurations` existe → portage rapide
- **Bilan** : logique complexe, schema Supabase à définir
- **Training/Séance** : dépend du bilan
- **Progression/Collection** : XP, niveaux, titres — à définir en Supabase
- **Classement, Profil** : secondaires

## Pièges connus

- **`data.clients` exclut systématiquement `yohan`** — pour les modals d'assignation, `yohan` est ajouté manuellement
- **`assignerTemplateAuClient`** : vérifier `templatesData` chargé avant `.find()`.
- **Règle permanente : `font-size` ≥ 16px** sur tout `input`/`textarea`/`select` — Safari iOS zoome sinon
- **`supaHeaders(extra)`** — toujours `{ Prefer: 'return=representation,resolution=merge-duplicates' }` pour les upserts
- **Un seul programme actif** par client (contrainte maintenue). **Plusieurs diètes actives** simultanées autorisées (Jour On/Off).
- **`repas.template_id`** (pas `diete_template_id`) — bug connu dans ancien code diete.js, corrigé.
- **`client_profils`** (avec 's') ≠ `client_profiles` (table PWA prod avec 'es')
- **Deux GAS distincts** : `api.js` → GAS sandbox. Migrations → `GAS_PROD_URL` via `apiGasProd()`. Ne pas mélanger.
- **`GAS_ID_MAP`** : `yohanp` → `yohan` pour toute lecture GAS.
- **`chargerHistoriqueBilans(client)`** existe dans GAS → retourne `[{ligneTitre, semaine, date, dejaEnvoye}]`, newest first.
- **`chargerBilanParLigne(client, ligneTitre)`** → données complètes d'un bilan (jours, repas, commentaires).
- **Nested select Supabase** : filtres d'ordre sur tables imbriquées → `&table_enfant.order=colonne.asc` dans le query string.
- **`alimentsCoachData`** : lazy-loadé (null jusqu'au premier accès).
- **Plusieurs templates avec le même nom** : `diete.js` prend le plus récent (`order=id.desc&limit=1`). La migration ne désactive plus les diètes existantes. Si deux templates partagent le même nom, le plus récent gagne côté client.
- **Aliments migrés** : `repas_aliments` stocke macros directement (pas de FK `aliments_coach`). `diete.js` fait fallback sur les colonnes directes. L'éditeur coach (`editerDieteClient`) lit aussi directement via `select=*,repas_aliments(*)`.
- **Re-migrer après ajout de fonctionnalités** : les équivalences et logs programme n'étaient pas importés dans les anciennes migrations — re-migrer pour avoir les données complètes. La migration est maintenant **idempotente** : re-migrer écrase proprement sans doublon.
- **`client_only` sur `diete_templates`** : ajouté manuellement via SQL (`ALTER TABLE diete_templates ADD COLUMN IF NOT EXISTS client_only BOOLEAN NOT NULL DEFAULT false`). Idem `variante_index` sur `repas`.
- **`client_programme_exercices.exercice_id`** : null pour les exercices migrés depuis GAS (la migration n'insère que `nom`). L'éditeur et la vue logs font un fallback lookup par nom dans `exercicesData` pour trouver `groupe_musculaire`.
- **Race condition logs** (`pcSauverLog`) : corrigée avec mise à jour optimiste de `_pcLogs[key]` + queue `_pcSaveQueues[key]` par série. Enregistrement existant (a un `id`) → PATCH champ unique. Nouveau → POST avec tous les champs non-null accumulés. Ne jamais revenir à l'ancienne approche upsert sans queue.
- **Bilan nav prev/next** : `_bilanNavList`, `_bilanNavIdx`, `_bilanNavSource` ('fiche'|'bilans'). Bouton retour contextuel. `_weekRange()` calcule "DD Mon → DD Mon" (dimanche = fin de semaine).

## Workflow

- Push git sans demander confirmation.
- Tout développement **uniquement ici** (AppTrainingDatabase), pas dans AppTrainingPWA.
- AppTrainingPWA = référence lecture seule pour comprendre le comportement attendu.
- Tester avec `yohanp` (supabase_only).
- Avant portage d'une fonctionnalité, relire `../AppTrainingPWA/` pour la logique GAS et l'UI cible. **Ne jamais lire `../AppTraining/`.**
