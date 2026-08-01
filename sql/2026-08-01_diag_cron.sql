-- Diagnostic : confirme si pg_cron exécute effectivement des jobs.
-- Insère une ligne dans cron_heartbeat toutes les minutes.
-- Si la table reste vide après 2-3 minutes, pg_cron ne tourne pas du tout
-- (permissions, extension non activée correctement, etc.) — regarder le
-- message d'erreur affiché par l'éditeur SQL Supabase à l'exécution de ce
-- fichier, c'est la donnée la plus utile pour la suite.

CREATE TABLE IF NOT EXISTS cron_heartbeat (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

SELECT cron.unschedule('heartbeat-test') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'heartbeat-test'
);
SELECT cron.schedule('heartbeat-test', '* * * * *', $$INSERT INTO cron_heartbeat DEFAULT VALUES$$);

-- Vérification immédiate : la liste des jobs cron enregistrés.
SELECT jobid, jobname, schedule, active FROM cron.job;
