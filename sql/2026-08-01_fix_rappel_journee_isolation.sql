-- Bug trouvé via cron.job_run_details : à 19h30 UTC (21h30 Paris, la bonne
-- fenêtre), le job a échoué sur client_id='yohan' — un ancien identifiant GAS
-- du coach (mapping GAS_ID_MAP) resté sur un vieux bilan orphelin, sans ligne
-- dans client_profils. La contrainte FK sur client_notifications a fait
-- planter cette insertion, et comme toute la boucle FOR s'exécute dans la
-- même transaction implicite du bloc PL/pgSQL, l'exception a annulé TOUT le
-- run — y compris les rappels des vrais clients abonnés (Perrine, Mathis...)
-- qui n'avaient rien à voir avec le problème.
--
-- Fix : chaque client est traité dans son propre bloc BEGIN/EXCEPTION, pour
-- qu'un cas cassé ne bloque plus jamais les autres.
CREATE OR REPLACE FUNCTION _rappel_journee_non_validee() RETURNS void AS $$
DECLARE
  v_paris_now timestamp;
  v_idx int;
  r RECORD;
BEGIN
  v_paris_now := (now() AT TIME ZONE 'Europe/Paris');
  IF v_paris_now::time < time '21:30' OR v_paris_now::time >= time '21:45' THEN
    RETURN;
  END IF;

  v_idx := (EXTRACT(DOW FROM (v_paris_now - interval '2 hours'))::int + 6) % 7;

  FOR r IN
    SELECT b.client_id
    FROM bilans b
    LEFT JOIN client_notif_prefs np ON np.client_id = b.client_id
    WHERE b.envoye_coach = false
      AND COALESCE(np.push_actif, true)
      AND COALESCE(np.rappel_journee, true)
      AND NOT COALESCE((b.jours->v_idx->>'valide')::boolean, false)
      AND b.id = (
        SELECT id FROM bilans b2
        WHERE b2.client_id = b.client_id AND b2.envoye_coach = false
        ORDER BY created_at DESC LIMIT 1
      )
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := 'https://sfacjbwiczwkcjpwneyg.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYWNqYndpY3p3a2NqcHduZXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjgzNTAsImV4cCI6MjEwMDIwNDM1MH0.mrjPbOuQROMihzxZWrUNbncQIos0jK2VexpQDoRZXzY'
        ),
        body := jsonb_build_object(
          'title', '⏰ N''oublie pas ta journée',
          'body', 'Pense à valider ta journée avant de dormir !',
          'client_id', r.client_id
        )
      );
      INSERT INTO client_notifications (client_id, title, body)
      VALUES (r.client_id, '⏰ N''oublie pas ta journée', 'Pense à valider ta journée avant de dormir !');
    EXCEPTION WHEN OTHERS THEN
      -- Un client cassé (FK, contrainte...) ne doit jamais empêcher les autres
      -- de recevoir leur rappel. On continue la boucle silencieusement.
      NULL;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
