-- Photos de machines prises par les clients depuis leur training (une photo par client et par exercice,
-- remplaçable). cle = id d'exercice de la bibliothèque, ou 'n:<nom en minuscules>' pour les exercices sans id.
CREATE TABLE IF NOT EXISTS client_machine_photos (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  cle TEXT NOT NULL,
  nom TEXT,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, cle)
);
CREATE INDEX IF NOT EXISTS idx_machine_photos_client ON client_machine_photos(client_id);
ALTER TABLE client_machine_photos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON client_machine_photos TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE client_machine_photos_id_seq TO anon, authenticated;
