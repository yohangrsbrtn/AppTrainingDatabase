-- Mode brouillon : un programme/diète tout juste créé pour un client (assignation de
-- template ou création "+ Créer" depuis zéro) reste invisible côté app tant que le coach
-- n'a pas cliqué "Publier" — évite que le client voie un programme à moitié configuré.
-- Ne s'applique volontairement PAS à l'édition d'un programme/diète déjà publié (scope
-- demandé par le coach : uniquement les nouvelles créations).
ALTER TABLE client_programmes ADD COLUMN IF NOT EXISTS brouillon BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE client_dietes     ADD COLUMN IF NOT EXISTS brouillon BOOLEAN NOT NULL DEFAULT false;
