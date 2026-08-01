-- Réduit la latence max du push chrono de 60s à 15s. Le cron '* * * * *'
-- (1x/min) causait un retard important sur les repos courts (15-30s) si
-- l'app passait en arrière-plan avant la fin locale du timer — seul le push
-- serveur prenait alors le relais, avec jusqu'à 60s de décalage.
-- pg_cron ≥1.4 supporte un 6e champ (secondes) : '*/15 * * * * *' = toutes
-- les 15 secondes.

SELECT cron.unschedule('fire-timer-jobs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fire-timer-jobs'
);
SELECT cron.schedule('fire-timer-jobs', '*/15 * * * * *', 'SELECT _fire_pending_timers()');
