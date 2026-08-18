-- Supersets (exercices liés à exécuter l'un après l'autre). Un entier partagé entre
-- plusieurs lignes de la même séance = même groupe superset. Le label affiché (A1/A2,
-- B1/B2...) est recalculé à l'affichage (ordre d'apparition du groupe dans la séance),
-- pas stocké — cette colonne ne sert qu'à savoir QUELS exercices sont liés entre eux.
ALTER TABLE programme_seance_exercices ADD COLUMN IF NOT EXISTS superset_groupe INTEGER;
ALTER TABLE client_programme_exercices ADD COLUMN IF NOT EXISTS superset_groupe INTEGER;
