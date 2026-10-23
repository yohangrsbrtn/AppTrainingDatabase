-- Brouillons de programmes (onglet Programmes → Architecture) : permet d'interrompre la construction
-- guidée et de la reprendre plus tard. etat = état complet de l'assistant (structure, répartition,
-- exercices choisis, séries, tempos, commentaires). client_id = personne visée (facultatif, juste un repère).
CREATE TABLE IF NOT EXISTS programme_brouillons (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  client_id TEXT,
  etat JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE programme_brouillons DISABLE ROW LEVEL SECURITY;
GRANT ALL ON programme_brouillons TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE programme_brouillons_id_seq TO anon, authenticated;
