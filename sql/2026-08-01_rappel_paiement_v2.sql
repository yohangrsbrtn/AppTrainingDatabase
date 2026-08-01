-- Refonte du rappel de paiement :
-- 1) Ce n'est plus un push (juste un historique dans client_notifications,
--    lu par la cloche de l'app) — donc plus de client_notif_prefs.rappel_paiement
--    ni de client_notif_prefs.push_actif à consulter, ni de net.http_post.
-- 2) Mode de paiement par client (virement/espèce/gocardless) — en GoCardless
--    (prélèvement automatique), plus jamais de rappel.
-- 3) Le coach valide manuellement dans la console si le client a payé pour le
--    mois en cours (dernier_mois_paye = 'YYYY-MM') — le rappel ne part que si
--    ce mois n'a pas encore été marqué payé, 3 jours après jour_paiement.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS mode_paiement TEXT
  CHECK (mode_paiement IS NULL OR mode_paiement IN ('virement','espece','gocardless'));
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS dernier_mois_paye TEXT; -- 'YYYY-MM'

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
    INSERT INTO client_notifications (client_id, title, body) VALUES (r.client_id, v_titre, v_corps);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
