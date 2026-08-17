-- Autorisation individuelle : certains clients peuvent modifier eux-mêmes
-- leurs séances (remplacer/ajouter/supprimer un exercice, réordonner) depuis
-- l'application mobile. Par défaut personne ne l'a — activé au cas par cas.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS auto_edition_programme BOOLEAN NOT NULL DEFAULT false;

UPDATE client_profils SET auto_edition_programme = true WHERE client_id = 'yohanp';
