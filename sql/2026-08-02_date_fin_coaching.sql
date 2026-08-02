-- Date de fin du forfait de coaching (offre 6 mois / 1 an, payée en une ou
-- trois fois à l'avance) — distincte du "Début du coaching". Sert de base au
-- rappel dashboard "Fins de coaching à venir" pour les clients en GoCardless
-- (aucun rappel de paiement mensuel ne les concerne sinon, cf.
-- 2026-08-01_rappel_paiement_v2.sql) : le coach doit penser à mettre en place
-- un nouveau prélèvement avant l'échéance s'ils reconduisent.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS date_fin_coaching DATE;
