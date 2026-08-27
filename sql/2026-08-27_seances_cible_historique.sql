-- Historise l'objectif "séances/semaine" (client_profils.seances_cible) au lieu de la simple
-- colonne courante, pour que la jauge "séances faites / séances attendues" (progression) ne
-- recalcule pas rétroactivement les semaines passées quand le coach change l'objectif.
-- Voir api.js : chargerSeancesCibleHistorique / enregistrerSeancesCibleHistorique / _seancesAttenduesHistorise.

CREATE TABLE IF NOT EXISTS client_seances_cible_historique (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  valeur INTEGER NOT NULL,
  date_effet DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, date_effet)
);

CREATE INDEX IF NOT EXISTS idx_seances_cible_hist_client ON client_seances_cible_historique(client_id);

-- Backfill : pour chaque client ayant déjà un objectif seances_cible renseigné, on suppose
-- qu'il est en vigueur depuis le début du coaching (meilleure approximation possible, cohérente
-- avec le comportement actuel qui l'appliquait déjà à toutes les semaines passées).
INSERT INTO client_seances_cible_historique (client_id, valeur, date_effet)
SELECT client_id, seances_cible, COALESCE(date_debut_suivi, date_debut, CURRENT_DATE)
FROM client_profils
WHERE seances_cible IS NOT NULL
ON CONFLICT (client_id, date_effet) DO NOTHING;
