-- Décale l'heure du rappel de journée non validée de 21h30 à 22h15 (fenêtre de 15 min,
-- même pattern DST-safe que les autres rappels : cron toutes les 15 min en UTC fixe, la
-- fonction vérifie l'heure locale Europe/Paris).
CREATE OR REPLACE FUNCTION _rappel_journee_non_validee() RETURNS void AS $$
DECLARE
  v_paris_now timestamp;
  v_idx int;
  r RECORD;
BEGIN
  v_paris_now := (now() AT TIME ZONE 'Europe/Paris');
  IF v_paris_now::time < time '22:15' OR v_paris_now::time >= time '22:30' THEN
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
      INSERT INTO client_notifications (client_id, title, body, source)
      VALUES (r.client_id, '⏰ N''oublie pas ta journée', 'Pense à valider ta journée avant de dormir !', 'rappel_journee');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
