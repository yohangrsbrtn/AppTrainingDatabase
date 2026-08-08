-- Corbeille pour le pense-bête coach (coach_todos) — "Supprimer" devient un
-- archivage réversible au lieu d'un DELETE définitif, même principe que la
-- corbeille des bilans (colonne `archive`).
ALTER TABLE coach_todos ADD COLUMN IF NOT EXISTS archive BOOLEAN NOT NULL DEFAULT false;
