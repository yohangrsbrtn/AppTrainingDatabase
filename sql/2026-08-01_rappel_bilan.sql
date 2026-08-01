-- Rappel "n'oublie pas d'envoyer ton bilan" vers 10h heure de Paris, le jour
-- du bilan du client (client_profils.jour_bilan), tant qu'il n'a pas encore
-- de bilan envoyé en attente.
ALTER TABLE client_notif_prefs ADD COLUMN IF NOT EXISTS rappel_bilan BOOLEAN NOT NULL DEFAULT true;

-- Même principe que _rappel_paiement_en_retard / _rappel_journee_non_validee :
-- le job pg_cron tourne toutes les 15 min en UTC fixe, la fonction elle-même
-- filtre sur l'heure locale de Paris (10h00-10h14) — gère heure été/hiver
-- sans jamais avoir à retoucher le cron. Fenêtre volontairement identique à
-- celle du rappel de paiement : deux jobs distincts, pas de conflit.
--
-- jour_bilan est un nom de jour français ('Lundi'..'Dimanche'), même
-- convention que _JOURS_IDX_FR côté client (api.js) : Lundi=0 ... Dimanche=6.
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
    INSERT INTO client_notifications (client_id, title, body) VALUES (r.client_id, v_titre, v_corps);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.unschedule('rappel-bilan') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rappel-bilan');
SELECT cron.schedule('rappel-bilan', '*/15 * * * *', 'SELECT _rappel_bilan_a_envoyer();');
