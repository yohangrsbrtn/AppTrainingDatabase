-- Analyses de sang (prises de sang) — portage de l'ancienne feuille GAS "Analyses".
-- Une ligne = un marqueur à une date donnée. Saisie coach uniquement (console.html),
-- lecture seule côté client (protocole.js, onglet "Analyses"), même gating que le
-- protocole chimie (client_profils.chimie_actif).
CREATE TABLE IF NOT EXISTS client_analyses_sante (
  id         BIGSERIAL PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES client_profils(client_id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  nom        TEXT NOT NULL,
  valeur     NUMERIC NOT NULL,
  unite      TEXT,
  ref_min    NUMERIC,
  ref_max    NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_analyses_sante_client_date
  ON client_analyses_sante(client_id, date DESC);
