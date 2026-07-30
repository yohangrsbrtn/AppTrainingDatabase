-- Cycles d'entraînement : grouper plusieurs programmes en un cycle progressif
CREATE TABLE IF NOT EXISTS programme_cycles (
  id          BIGSERIAL PRIMARY KEY,
  client_id   TEXT NOT NULL,
  nom         TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Lien optionnel des programmes clients vers un cycle
ALTER TABLE client_programmes
  ADD COLUMN IF NOT EXISTS cycle_id            BIGINT REFERENCES programme_cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ordre_dans_cycle    INT DEFAULT 0;
