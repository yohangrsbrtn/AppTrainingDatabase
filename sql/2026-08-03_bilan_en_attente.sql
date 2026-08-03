-- Statut "en attente" pour un bilan envoyé : le coach attend une info complémentaire du
-- client (ex: mensurations manquantes) avant de pouvoir le traiter. Distinct de "à
-- traiter" (envoye_coach=true, coach_traite=false, en_attente=false) et de "traité"
-- (coach_traite=true) — un bilan en attente n'apparaît dans aucun des deux tant qu'il
-- n'est pas repassé "à traiter" ou marqué traité directement.
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS en_attente BOOLEAN NOT NULL DEFAULT false;
