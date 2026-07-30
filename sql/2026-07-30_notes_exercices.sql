-- Ajoute la colonne notes sur les exercices des programmes clients
-- (programme_seance_exercices a déjà notes depuis la création initiale)
ALTER TABLE client_programme_exercices
  ADD COLUMN IF NOT EXISTS notes TEXT;
