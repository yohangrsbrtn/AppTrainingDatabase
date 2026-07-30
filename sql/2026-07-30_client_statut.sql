-- Ajoute un champ statut sur client_profils pour classer les clients :
-- 'actif' (défaut), 'pause' (en pause de coaching), 'ancien' (ancien client).
-- Utilisé dans la console coach pour filtrer par onglet.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'actif'
  CHECK (statut IN ('actif', 'pause', 'ancien'));
