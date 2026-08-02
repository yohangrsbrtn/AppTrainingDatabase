-- Distinguer les rappels automatiques (bilan, journée) des envois manuels du
-- coach dans client_notifications, + tracer la date de lecture (pas
-- seulement le booléen lu) — demandé pour un onglet dédié "Notifications de
-- rappel" côté console avec confirmation de lecture (lu + date de lecture).
ALTER TABLE client_notifications ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manuel';
ALTER TABLE client_notifications ADD COLUMN IF NOT EXISTS lu_at TIMESTAMPTZ;

-- Rappel bilan : tag source='rappel_bilan'.
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
  v_idx_jour := (EXTRACT(DOW FROM v_paris_now)::int + 6) % 7; -- Lundi=0 ... Dimanche=6

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
        SELECT 1 FROM bilans b WHERE b.client_id = p.client_id AND b.envoye_coach = false
      )
  LOOP
    PERFORM net.http_post(
      url := 'https://sfacjbwiczwkcjpwneyg.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYWNqYndpY3p3a2NqcHduZXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjgzNTAsImV4cCI6MjEwMDIwNDM1MH0.mrjPbOuQROMihzxZWrUNbncQIos0jK2VexpQDoRZXzY'
      ),
      body := jsonb_build_object('title', v_titre, 'body', v_corps, 'client_id', r.client_id)
    );
    INSERT INTO client_notifications (client_id, title, body, source) VALUES (r.client_id, v_titre, v_corps, 'rappel_bilan');
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rappel journée : tag source='rappel_journee'.
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
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rappel paiement : tag source='rappel_paiement' (pas affiché dans l'onglet
-- "rappel" demandé, qui ne couvre que bilan+journée, mais tagué pour rester
-- cohérent et exploitable plus tard si besoin).
CREATE OR REPLACE FUNCTION _rappel_paiement_en_retard() RETURNS void AS $$
DECLARE
  v_paris_now timestamp;
  v_aujourdhui date;
  v_titre text := '💳 Petit rappel';
  v_corps text := 'N''oublie pas de faire le virement à ton coach pour qu''il puisse acheter sa créatine 💪';
  r RECORD;
BEGIN
  v_paris_now := (now() AT TIME ZONE 'Europe/Paris');
  IF v_paris_now::time < time '10:00' OR v_paris_now::time >= time '10:15' THEN
    RETURN;
  END IF;
  v_aujourdhui := v_paris_now::date;

  FOR r IN
    SELECT p.client_id
    FROM client_profils p
    WHERE p.jour_paiement IS NOT NULL
      AND COALESCE(p.mode_paiement, '') <> 'gocardless'
      AND COALESCE(p.dernier_mois_paye, '') <> to_char(v_aujourdhui, 'YYYY-MM')
      AND v_aujourdhui = (date_trunc('month', v_aujourdhui)::date + ((p.jour_paiement - 1) + 3) * interval '1 day')::date
  LOOP
    INSERT INTO client_notifications (client_id, title, body, source) VALUES (r.client_id, v_titre, v_corps, 'rappel_paiement');
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
