-- Objectif coach (visible uniquement côté console) sur un programme client.
ALTER TABLE client_programmes ADD COLUMN IF NOT EXISTS objectif TEXT;

-- Suivi coach : journal daté des ajustements faits après un bilan (nutrition,
-- entraînement, commentaire général). Remplace l'usage de notes_coach (table
-- vide à ce jour) dans la fiche client.
CREATE TABLE IF NOT EXISTS client_suivi (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  nutrition TEXT,
  entrainement TEXT,
  commentaire_general TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_suivi_client_date ON client_suivi(client_id, date DESC);
