-- Sexe du client — nécessaire pour le résumé micronutriments (les RNP ANSES diffèrent
-- homme/femme sur plusieurs nutriments : fer, magnésium, zinc, cuivre, vitamine E...).
-- Valeurs 'H'/'F', nullable (pas de valeur par défaut devinée) — voir project_architecture_recettes_aliments.md.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS sexe TEXT CHECK (sexe IN ('H','F') OR sexe IS NULL);
