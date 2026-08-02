-- Le push "repos terminé" doit être livré au plus vite — un rappel de fin de
-- repos qui arrive plusieurs minutes en retard n'a plus aucune valeur (vécu :
-- chrono de 30s, notification reçue très longtemps après). send-push (edge
-- function) accepte maintenant un flag "urgent" qui règle priorité "high" +
-- TTL court côté Web Push — on le passe ici pour le chrono spécifiquement.
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
        'tag',       'chrono',
        'urgent',    true
      )
    );
  END LOOP;
  DELETE FROM timer_jobs WHERE created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérifie l'intervalle réellement programmé pour ce job — s'il affiche encore
-- '* * * * *' (1x/min) au lieu de '*/15 * * * * *' (15s), le fichier
-- 2026-08-01_cron_interval_15s.sql n'a jamais été exécuté : à relancer.
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'fire-timer-jobs';
