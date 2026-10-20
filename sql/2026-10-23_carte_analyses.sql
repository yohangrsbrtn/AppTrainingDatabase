-- Historique des analyses de photos qui accompagnent les cartes de personnage (visible coach uniquement).
-- Une ligne par analyse : texte détaillé rédigé par la tâche planifiée, statut selon la décision du coach.
CREATE TABLE IF NOT EXISTS client_carte_analyses (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  mois DATE NOT NULL,
  texte TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','valide','rejete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_carte_analyses_client ON client_carte_analyses(client_id, created_at DESC);
ALTER TABLE client_carte_analyses DISABLE ROW LEVEL SECURITY;
GRANT ALL ON client_carte_analyses TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE client_carte_analyses_id_seq TO anon, authenticated;
