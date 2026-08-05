-- Diagnostic + fix du chrono de repos qui ne se déclenchait jamais en push (écran
-- verrouillé/app en fond) : la fonction _fire_pending_timers() fonctionne très bien
-- quand on l'appelle directement (testé via RPC), mais un test réel a montré qu'un job
-- programmé ne se déclenchait jamais tout seul après 40+ secondes — le cron censé
-- l'appeler toutes les 15s n'est manifestement pas actif.
--
-- 1) Diagnostic — colle ce SELECT seul d'abord si tu veux voir l'état avant fix :
--    SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'fire-timer-jobs';
--    Si aucune ligne : le job n'a jamais été créé (ou perdu). Si une ligne avec
--    active=false : il existe mais est désactivé.
--
--    Historique des dernières exécutions (si le job existe) :
--    SELECT status, return_message, start_time, end_time
--    FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'fire-timer-jobs')
--    ORDER BY start_time DESC LIMIT 10;
--
-- 2) Fix — re-planifie proprement le job (idempotent, sans risque à ré-exécuter) :
SELECT cron.unschedule('fire-timer-jobs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fire-timer-jobs'
);
SELECT cron.schedule('fire-timer-jobs', '*/15 * * * * *', 'SELECT _fire_pending_timers()');

-- 3) Vérification finale — doit renvoyer exactement 1 ligne, active=true :
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'fire-timer-jobs';
