-- Lien manuel entre un aliment de la base coach et son équivalent CIQUAL (jamais deviné
-- automatiquement — le coach confirme le rapprochement lui-même dans la console). Permet au
-- résumé micronutriments de retrouver les vitamines/minéraux d'un aliment coach même quand son
-- nom ne correspond pas mot pour mot à la nomenclature CIQUAL (ex: "Blanc de poulet" vs
-- "Poulet, blanc, cru"). Nullable : un aliment non lié reste simplement absent du calcul.
ALTER TABLE aliments_coach ADD COLUMN IF NOT EXISTS ciqual_id INTEGER REFERENCES ciqual_aliments(id);
