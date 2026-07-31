-- Jour de facturation (jour du mois, pas une date précise) + rappel
-- automatique 3 jours après si rien n'a changé.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS jour_paiement SMALLINT
  CHECK (jour_paiement IS NULL OR (jour_paiement BETWEEN 1 AND 31));

ALTER TABLE client_notif_prefs ADD COLUMN IF NOT EXISTS rappel_paiement BOOLEAN NOT NULL DEFAULT true;

-- Même principe que _rappel_journee_non_validee (sql/2026-08-01_rappel_journee.sql) :
-- le job pg_cron tourne toutes les 15 min en UTC fixe, la fonction elle-même
-- filtre sur l'heure locale de Paris (10h00-10h14) — gère heure été/hiver
-- sans jamais avoir à retoucher le cron.
--
-- "3 jours après" est calculé en arithmétique de date pure depuis le 1er du
-- mois courant (jour_paiement - 1 + 3 jours), donc un jour_paiement proche de
-- la fin du mois déborde proprement sur le mois suivant plutôt que de planter.
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
    SELECT p.client_id, p.jour_paiement
    FROM client_profils p
    LEFT JOIN client_notif_prefs np ON np.client_id = p.client_id
    WHERE p.jour_paiement IS NOT NULL
      AND COALESCE(np.push_actif, true)
      AND COALESCE(np.rappel_paiement, true)
      AND v_aujourdhui = (date_trunc('month', v_aujourdhui)::date + ((p.jour_paiement - 1) + 3) * interval '1 day')::date
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

SELECT cron.unschedule('rappel-paiement') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rappel-paiement');
SELECT cron.schedule('rappel-paiement', '*/15 * * * *', 'SELECT _rappel_paiement_en_retard();');
