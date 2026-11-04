-- Séances libres : séance créée au fil de l'eau à la salle, validée = 1 séance du jour + historique.
CREATE TABLE IF NOT EXISTS client_seances_libres (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  nom TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  duree_min INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS client_seances_libres_series (
  id BIGSERIAL PRIMARY KEY,
  seance_id BIGINT NOT NULL REFERENCES client_seances_libres(id) ON DELETE CASCADE,
  exercice_id BIGINT REFERENCES exercices(id) ON DELETE SET NULL,
  exercice_nom TEXT NOT NULL,
  ordre_exo INT NOT NULL DEFAULT 0,
  numero_serie INT NOT NULL,
  charge NUMERIC,
  reps NUMERIC,
  rir NUMERIC,
  valide BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_seances_libres_client ON client_seances_libres(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_seances_libres_series ON client_seances_libres_series(seance_id);
ALTER TABLE client_seances_libres ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_seances_libres_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON client_seances_libres;
DROP POLICY IF EXISTS anon_all ON client_seances_libres_series;
CREATE POLICY anon_all ON client_seances_libres FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON client_seances_libres_series FOR ALL TO anon USING (true) WITH CHECK (true);

-- Commentaires (séance et exercice) — ajout du 2026-11-04
ALTER TABLE client_seances_libres ADD COLUMN IF NOT EXISTS commentaire TEXT;
ALTER TABLE client_seances_libres_series ADD COLUMN IF NOT EXISTS commentaire TEXT;
