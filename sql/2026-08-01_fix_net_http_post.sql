-- Fix : ::text cassait la signature de net.http_post (body doit rester jsonb,
-- comme dans _envoyer_push qui fonctionne). Confirmé par cron.job_run_details :
-- "function net.http_post(url => unknown, headers => jsonb, body => text)
-- does not exist" — le cron tournait bien, mais chaque appel échouait.

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
  DELETE FROM timer_jobs WHERE created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nettoyage du diagnostic (plus utile une fois le fix confirmé)
SELECT cron.unschedule('heartbeat-test') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'heartbeat-test'
);
DROP TABLE IF EXISTS cron_heartbeat;
