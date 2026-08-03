-- Pense-bête coach : widget flottant accessible depuis toute la console,
-- auto-sauvegarde à chaque ajout/coche/suppression. Table globale coach
-- (pas de client_id — un seul coach utilise la console).
CREATE TABLE IF NOT EXISTS coach_todos (
  id BIGSERIAL PRIMARY KEY,
  texte TEXT NOT NULL,
  fait BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
