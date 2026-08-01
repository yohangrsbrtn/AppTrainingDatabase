-- Chronomètre de repos : planification push côté serveur.
-- Quand le client lance un timer, une ligne est insérée avec fire_at.
-- pg_cron fire_pending_timers() tourne toutes les minutes et envoie le push
-- aux timers arrivés à échéance (latence max ~60s, acceptable pour un repos).

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS timer_jobs (
  id         BIGSERIAL PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES client_profils(client_id) ON DELETE CASCADE,
  fire_at    TIMESTAMPTZ NOT NULL,
  fired      BOOLEAN NOT NULL DEFAULT false,
  cancelled  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timer_jobs_pending ON timer_jobs(fire_at)
  WHERE NOT fired AND NOT cancelled;

CREATE OR REPLACE FUNCTION _fire_pending_timers() RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    UPDATE timer_jobs SET fired = true
    WHERE fire_at <= now() AND NOT fired AND NOT cancelled
    RETURNING client_id
  LOOP
    PERFORM net.http_post(
      url     := 'https://sfacjbwiczwkcjpwneyg.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYWNqYndpY3p3a2NqcHduZXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjgzNTAsImV4cCI6MjEwMDIwNDM1MH0.mrjPbOuQROMihzxZWrUNbncQIos0jK2VexpQDoRZXzY'
      ),
      body := jsonb_build_object(
        'title',     '⏱ Repos terminé !',
        'body',      'C''est reparti 💪',
        'client_id', r.client_id,
        'tag',       'chrono'
      )
    );
  END LOOP;
  -- Nettoyage des jobs de plus d'une heure
  DELETE FROM timer_jobs WHERE created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cron toutes les minutes (remplacer si déjà existant)
SELECT cron.unschedule('fire-timer-jobs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fire-timer-jobs'
);
SELECT cron.schedule('fire-timer-jobs', '* * * * *', 'SELECT _fire_pending_timers()');
