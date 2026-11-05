-- Calibration des exercices étalons (niveaux par muscle) : le client saisit kg × reps sur un exercice de référence.
-- La saisie la plus récente par exercice fait foi ; les anciennes sont conservées (historique).
CREATE TABLE IF NOT EXISTS client_calibrations (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  exercice_nom TEXT NOT NULL,
  charge NUMERIC NOT NULL DEFAULT 0,
  reps INT NOT NULL,
  rir NUMERIC,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_calibrations_client_idx ON client_calibrations (client_id, exercice_nom, date);
ALTER TABLE client_calibrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON client_calibrations;
CREATE POLICY anon_all ON client_calibrations FOR ALL TO anon USING (true) WITH CHECK (true);
