-- Photos liées à une saisie de mensurations (client mobile) — même principe que
-- bilan_photos, réutilise le bucket Storage "bilans-photos" déjà existant (préfixe de
-- chemin "mensurations/" pour les séparer) plutôt que de créer un nouveau bucket.
CREATE TABLE IF NOT EXISTS mensuration_photos (
  id             BIGSERIAL PRIMARY KEY,
  mensuration_id BIGINT NOT NULL REFERENCES mensurations(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES client_profils(client_id) ON DELETE CASCADE,
  url            TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
