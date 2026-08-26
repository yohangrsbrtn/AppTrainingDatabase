-- Base CIQUAL (ANSES) — table de composition nutritionnelle officielle française,
-- 3484 aliments bruts/génériques avec macros + vitamines + minéraux, Licence Ouverte.
-- Import ponctuel (comme le catalogue de gifs d'exercices) : table remplie une fois via script,
-- jamais mise à jour en direct depuis une API. Voir project_architecture_recettes_aliments.md.
CREATE TABLE IF NOT EXISTS ciqual_aliments (
  id SERIAL PRIMARY KEY,
  code INTEGER UNIQUE NOT NULL,       -- alim_code CIQUAL, sert de clé stable pour un futur ré-import
  nom TEXT NOT NULL,
  groupe TEXT,                        -- alim_grp_nom_fr (catégorie CIQUAL, ex: "viandes, œufs, poissons")

  kcal_100g NUMERIC,
  prot_100g NUMERIC,
  glucides_100g NUMERIC,
  lipides_100g NUMERIC,
  sucres_100g NUMERIC,
  fibres_100g NUMERIC,
  ags_100g NUMERIC,                   -- acides gras saturés — cohérent avec aliments_communaute.ags_par_100g

  calcium_mg NUMERIC,
  fer_mg NUMERIC,
  magnesium_mg NUMERIC,
  zinc_mg NUMERIC,
  potassium_mg NUMERIC,
  sodium_mg NUMERIC,
  phosphore_mg NUMERIC,
  cuivre_mg NUMERIC,
  iode_ug NUMERIC,
  selenium_ug NUMERIC,
  manganese_mg NUMERIC,

  vit_a_ug NUMERIC,   -- équivalents rétinol
  vit_d_ug NUMERIC,
  vit_e_mg NUMERIC,
  vit_k1_ug NUMERIC,
  vit_c_mg NUMERIC,
  vit_b1_mg NUMERIC,
  vit_b2_mg NUMERIC,
  vit_b3_mg NUMERIC,
  vit_b5_mg NUMERIC,
  vit_b6_mg NUMERIC,
  vit_b9_ug NUMERIC,  -- folates totaux, équivalents DFE
  vit_b12_ug NUMERIC,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pas d'index trigram : 3484 lignes, une recherche ILIKE '%...%' reste instantanée à cette échelle.
