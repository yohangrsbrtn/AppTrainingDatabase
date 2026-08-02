-- Changement de convention : les macros (kcal/prot/glu/lip, + sucres/fibres/
-- ags pour aliments_communaute) étaient stockées "par gramme" (valeur ×
-- quantité = total). Elles sont désormais stockées "pour 100g" (valeur ×
-- quantité ÷ 100 = total) — demande explicite du coach, qui consultait ces
-- valeurs directement en base et trouvait la convention "par gramme" trompeuse
-- (l'app affichait "/100g" un peu partout en multipliant par 100 à la volée).
--
-- Portée : aliments_coach, repas_aliments, aliments_communaute. Seules les
-- lignes en unité "poids" (unite='g' ou NULL) sont multipliées par 100 —
-- les aliments en "unité/portion" (ex: recette exportée) gardent leur valeur
-- telle quelle (leur colonne représente "par portion", pas "par gramme",
-- donc rien à convertir). aliments_communaute n'a pas de colonne `unite`
-- (toujours au poids) — multiplication inconditionnelle.
--
-- Tout le code applicatif (console.html + diete.js) a été mis à jour en
-- cohérence AVANT ce script — ne pas exécuter séparément d'un déploiement de
-- ces fichiers, sinon incohérence temporaire entre code et données.

-- 1) Multiplier les valeurs existantes.
UPDATE aliments_coach SET
  kcal_par_gramme = kcal_par_gramme * 100,
  prot_par_gramme = prot_par_gramme * 100,
  glu_par_gramme  = glu_par_gramme * 100,
  lip_par_gramme  = lip_par_gramme * 100
WHERE COALESCE(unite, 'g') = 'g';

UPDATE repas_aliments SET
  kcal_par_gramme = kcal_par_gramme * 100,
  prot_par_gramme = prot_par_gramme * 100,
  glu_par_gramme  = glu_par_gramme * 100,
  lip_par_gramme  = lip_par_gramme * 100
WHERE COALESCE(unite, 'g') = 'g';

UPDATE aliments_communaute SET
  kcal_par_gramme   = kcal_par_gramme * 100,
  prot_par_gramme   = prot_par_gramme * 100,
  glu_par_gramme    = glu_par_gramme * 100,
  sucres_par_gramme = sucres_par_gramme * 100,
  fibres_par_gramme = fibres_par_gramme * 100,
  lip_par_gramme    = lip_par_gramme * 100,
  ags_par_gramme    = ags_par_gramme * 100;

-- 2) Renommer les colonnes pour refléter la nouvelle convention.
ALTER TABLE aliments_coach RENAME COLUMN kcal_par_gramme TO kcal_par_100g;
ALTER TABLE aliments_coach RENAME COLUMN prot_par_gramme TO prot_par_100g;
ALTER TABLE aliments_coach RENAME COLUMN glu_par_gramme  TO glu_par_100g;
ALTER TABLE aliments_coach RENAME COLUMN lip_par_gramme  TO lip_par_100g;

ALTER TABLE repas_aliments RENAME COLUMN kcal_par_gramme TO kcal_par_100g;
ALTER TABLE repas_aliments RENAME COLUMN prot_par_gramme TO prot_par_100g;
ALTER TABLE repas_aliments RENAME COLUMN glu_par_gramme  TO glu_par_100g;
ALTER TABLE repas_aliments RENAME COLUMN lip_par_gramme  TO lip_par_100g;

ALTER TABLE aliments_communaute RENAME COLUMN kcal_par_gramme   TO kcal_par_100g;
ALTER TABLE aliments_communaute RENAME COLUMN prot_par_gramme   TO prot_par_100g;
ALTER TABLE aliments_communaute RENAME COLUMN glu_par_gramme    TO glu_par_100g;
ALTER TABLE aliments_communaute RENAME COLUMN sucres_par_gramme TO sucres_par_100g;
ALTER TABLE aliments_communaute RENAME COLUMN fibres_par_gramme TO fibres_par_100g;
ALTER TABLE aliments_communaute RENAME COLUMN lip_par_gramme    TO lip_par_100g;
ALTER TABLE aliments_communaute RENAME COLUMN ags_par_gramme    TO ags_par_100g;

-- Note pour plus tard : sur les lignes unite='portion' (aliments_coach /
-- repas_aliments), la colonne "kcal_par_100g" contient en réalité une valeur
-- "par portion" non convertie — même limitation qu'avant (l'ancienne colonne
-- "kcal_par_gramme" contenait déjà une valeur "par portion" pour ces lignes,
-- pas une vraie valeur au gramme). Le nom de colonne reste donc approximatif
-- pour ce cas minoritaire, mais la valeur et le calcul restent corrects.
