-- Rapports de bugs client, portage Supabase (remplace l'action GAS
-- envoyerRapportBug/chargerRapportsBugs/marquerBugLu, seule fonctionnalité
-- encore 100% GAS avant le nettoyage complet du backend legacy).
CREATE TABLE IF NOT EXISTS rapports_bugs (
  id         BIGSERIAL PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES client_profils(client_id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  lu         BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rapports_bugs_created ON rapports_bugs(created_at DESC);
