-- Carte de personnage (radar de développement musculaire) : un score 0-100 par axe et par mois,
-- saisi par le coach (curseurs dans la fiche client → Progression). Les axes affichés pour un client
-- sont ceux qui ont une ligne ce mois-là (axes réglables par client). Voir api.js : CARTE_AXES,
-- chargerCarteClient, _carteRadarSvg.

CREATE TABLE IF NOT EXISTS client_carte_personnage (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  mois DATE NOT NULL,            -- toujours le 1er du mois (ex: 2026-10-01)
  axe TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, mois, axe)
);
CREATE INDEX IF NOT EXISTS idx_carte_perso_client ON client_carte_personnage(client_id);
ALTER TABLE client_carte_personnage DISABLE ROW LEVEL SECURITY;
GRANT ALL ON client_carte_personnage TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE client_carte_personnage_id_seq TO anon, authenticated;

-- Test : carte de Mathis Le Ray (estimation depuis ses photos du 02/08 et du 18/10/2026, à ajuster
-- à la main depuis la console).
INSERT INTO client_carte_personnage (client_id, mois, axe, score) VALUES
 ('mathisleray','2026-08-01','Pecs',52),('mathisleray','2026-08-01','Dos',58),('mathisleray','2026-08-01','Épaules',60),
 ('mathisleray','2026-08-01','Bras',58),('mathisleray','2026-08-01','Quadris',55),('mathisleray','2026-08-01','Ischios',50),
 ('mathisleray','2026-08-01','Fessiers',48),('mathisleray','2026-08-01','Mollets',46),
 ('mathisleray','2026-10-01','Pecs',60),('mathisleray','2026-10-01','Dos',64),('mathisleray','2026-10-01','Épaules',66),
 ('mathisleray','2026-10-01','Bras',60),('mathisleray','2026-10-01','Quadris',57),('mathisleray','2026-10-01','Ischios',52),
 ('mathisleray','2026-10-01','Fessiers',50),('mathisleray','2026-10-01','Mollets',48)
ON CONFLICT (client_id, mois, axe) DO NOTHING;
