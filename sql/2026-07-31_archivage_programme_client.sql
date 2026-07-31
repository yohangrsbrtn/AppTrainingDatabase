-- Remplace la suppression définitive d'un programme client (qui effaçait tous
-- ses logs en cascade) par un archivage : les données restent en base et
-- consultables, juste masquées par défaut dans la fiche client.
ALTER TABLE client_programmes ADD COLUMN IF NOT EXISTS archive BOOLEAN NOT NULL DEFAULT false;
