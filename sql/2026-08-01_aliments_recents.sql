-- Aliments récemment utilisés par client (picker "+ Ajouter un aliment") —
-- personnel par nature (contrairement au cache code-barres aliments_communaute,
-- qui reste partagé entre tous les clients : un produit scanné une fois profite
-- à tout le monde, mais "ce que Perrine mange souvent" n'a rien à voir avec les
-- habitudes de Mathis).
CREATE TABLE IF NOT EXISTS client_aliments_recents (
  id                   BIGSERIAL PRIMARY KEY,
  client_id            TEXT NOT NULL REFERENCES client_profils(client_id) ON DELETE CASCADE,
  aliment_nom          TEXT NOT NULL,
  aliment_source       TEXT NOT NULL, -- 'coach' | 'communaute'
  derniere_utilisation TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, aliment_nom, aliment_source)
);
CREATE INDEX IF NOT EXISTS idx_client_aliments_recents ON client_aliments_recents(client_id, derniere_utilisation DESC);
