-- Vérifie précisément ce qui s'est passé au dernier passage du cron
-- "rappel-journee" (jobid=1) ce soir, entre 19h15 et 19h50 UTC (21h15-21h50
-- Paris) — la fenêtre où le rappel aurait dû se déclencher.
SELECT jobid, runid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid = 1 AND start_time > now() - interval '2 hours'
ORDER BY start_time DESC;
