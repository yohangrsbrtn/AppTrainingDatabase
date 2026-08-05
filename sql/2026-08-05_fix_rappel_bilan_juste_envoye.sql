-- Bug : le matin de jour_bilan, dès qu'un client envoie son bilan et rouvre l'app,
-- _supaGetOrCreateBilanCourant (bilan.js) crée immédiatement un nouveau bilan vide
-- (envoye_coach=false) pour la semaine suivante. _rappel_bilan_a_envoyer (10h00-10h14)
-- ne vérifiait que l'EXISTENCE d'un bilan non envoyé, sans regarder sa date de création
-- → ce bilan flambant neuf déclenchait un rappel "n'oublie pas ton bilan" quelques
-- minutes/heures après l'envoi réel du précédent (vécu, 2026-08-05, yohanp).
--
-- Fix : le bilan non envoyé doit avoir été créé AVANT aujourd'hui (Europe/Paris) pour
-- déclencher le rappel — un bilan créé aujourd'hui même n'est jamais en retard.

CREATE OR REPLACE FUNCTION _rappel_bilan_a_envoyer() RETURNS void AS $$
DECLARE
  v_paris_now timestamp;
  v_idx_jour int;
  v_titre text := '📋 N''oublie pas ton bilan';
  v_corps text := 'N''oublie pas d''envoyer ton bilan à ton coach.';
  r RECORD;
BEGIN
  v_paris_now := (now() AT TIME ZONE 'Europe/Paris');
  IF v_paris_now::time < time '10:00' OR v_paris_now::time >= time '10:15' THEN
    RETURN;
  END IF;
  v_idx_jour := (EXTRACT(DOW FROM v_paris_now)::int + 6) % 7;

  FOR r IN
    SELECT p.client_id
    FROM client_profils p
    LEFT JOIN client_notif_prefs np ON np.client_id = p.client_id
    WHERE COALESCE(np.push_actif, true)
      AND COALESCE(np.rappel_bilan, true)
      AND (CASE COALESCE(p.jour_bilan, 'Dimanche')
             WHEN 'Lundi' THEN 0 WHEN 'Mardi' THEN 1 WHEN 'Mercredi' THEN 2
             WHEN 'Jeudi' THEN 3 WHEN 'Vendredi' THEN 4 WHEN 'Samedi' THEN 5
             WHEN 'Dimanche' THEN 6 ELSE 6 END) = v_idx_jour
      AND EXISTS (
        SELECT 1 FROM bilans b
        WHERE b.client_id = p.client_id
          AND b.envoye_coach = false
          AND b.archive = false
          AND (b.created_at AT TIME ZONE 'Europe/Paris')::date < v_paris_now::date
      )
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := 'https://sfacjbwiczwkcjpwneyg.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYWNqYndpY3p3a2NqcHduZXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjgzNTAsImV4cCI6MjEwMDIwNDM1MH0.mrjPbOuQROMihzxZWrUNbncQIos0jK2VexpQDoRZXzY'
        ),
        body := jsonb_build_object('title', v_titre, 'body', v_corps, 'client_id', r.client_id)
      );
      INSERT INTO client_notifications (client_id, title, body, source) VALUES (r.client_id, v_titre, v_corps, 'rappel_bilan');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
