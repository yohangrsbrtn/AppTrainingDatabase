-- Le job 'fire-timer-jobs' existait bien et réussissait à chaque exécution (confirmé via
-- cron.job_run_details), MAIS s'exécutait toutes les 15 MINUTES et non toutes les 15
-- secondes comme voulu (sql/2026-08-01_cron_interval_15s.sql). Cause : pg_cron sur cette
-- instance Supabase ignore silencieusement le 6e champ (secondes) d'un schedule à 6
-- champs au lieu de renvoyer une erreur — il retombe sur une lecture 5 champs classique,
-- où '*/15' en position "minute" = toutes les 15 minutes. Aucune erreur visible nulle
-- part, juste le mauvais tempo — un chrono de repos court (15-90s) ne pouvait donc
-- jamais recevoir son push de fin dans un délai raisonnable.
--
-- Fix : repasse sur un schedule standard 5 champs, 1x/minute — le 15s ne fonctionne pas
-- sur cette instance. Délai max ~60s pour le fallback serveur (écran verrouillé/app
-- fermée) au lieu de ~15 min actuellement. Le bip local (app ouverte au premier plan)
-- n'est de toute façon pas concerné, il reste instantané.
SELECT cron.unschedule('fire-timer-jobs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fire-timer-jobs'
);
SELECT cron.schedule('fire-timer-jobs', '* * * * *', 'SELECT _fire_pending_timers()');

-- Vérification — doit renvoyer schedule='* * * * *', active=true :
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'fire-timer-jobs';
