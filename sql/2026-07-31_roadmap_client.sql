-- Roadmap client : phases datées (cut/reverse/prise de masse/maintenance/recomposition)
-- gérées par le coach, affichées en timeline côté client (nouvel onglet nav "Roadmap").
-- Pas de colonne d'ordre manuel : les phases sont triées par date_debut (chronologique).

CREATE TABLE IF NOT EXISTS client_roadmap (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  type TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  objectif TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_roadmap_client ON client_roadmap(client_id, date_debut);
