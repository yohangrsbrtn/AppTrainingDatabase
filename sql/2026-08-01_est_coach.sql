-- Fusion des comptes coach/client : yohanp devient le compte unique (coach + auto-suivi).
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS est_coach BOOLEAN NOT NULL DEFAULT false;
UPDATE client_profils SET est_coach = true WHERE client_id = 'yohanp';
