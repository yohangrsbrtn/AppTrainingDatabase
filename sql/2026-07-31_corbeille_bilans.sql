-- Corbeille bilans : suppression = archivage (récupérable), plutôt qu'un hard delete direct.
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS archive BOOLEAN NOT NULL DEFAULT false;
