-- Bloc actif pour chaque programme client
-- Permet au coach de définir quel bloc est en cours d'entraînement.
-- Les autres blocs restent accessibles en lecture seule côté mobile.
ALTER TABLE client_programmes
  ADD COLUMN IF NOT EXISTS bloc_actif_id BIGINT REFERENCES client_programme_blocs(id) ON DELETE SET NULL;
