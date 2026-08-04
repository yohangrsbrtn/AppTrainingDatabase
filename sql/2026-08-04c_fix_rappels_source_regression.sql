-- Régression introduite dans sql/2026-08-04_rappels_isolation_reapply.sql :
-- en ajoutant l'isolation BEGIN/EXCEPTION par client à _rappel_journee_non_validee
-- et _rappel_bilan_a_envoyer, les INSERT INTO client_notifications ont perdu
-- la colonne `source` (oubliée en réécrivant les fonctions) — la colonne
-- retombe silencieusement sur son défaut 'manuel' au lieu de 'rappel_journee'
-- / 'rappel_bilan'. Conséquence vécue le soir même (2026-08-04, ~21h30) :
-- le rappel de journée a bien tourné et bien poussé les notifications (15
-- clients notifiés en une seule transaction, dont le coach), mais ces
-- entrées sont invisibles dans l'onglet "Historique automatique" de la
-- console (qui filtre exactement source=rappel_journee/rappel_bilan/
-- rappel_paiement) — donnant l'impression à tort que le rappel n'avait pas
-- fonctionné ou pas été tracé.
--
-- Ce fichier réapplique les 2 fonctions à l'identique (même garde horaire,
-- même isolation BEGIN/EXCEPTION par client) en remettant `source` dans les
-- deux INSERT. CREATE OR REPLACE, sans risque à ré-exécuter.

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
      INSERT INTO client_notifications (client_id, title, body, source)
      VALUES (r.client_id, '⏰ N''oublie pas ta journée', 'Pense à valider ta journée avant de dormir !', 'rappel_journee');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
        SELECT 1 FROM bilans b WHERE b.client_id = p.client_id AND b.envoye_coach = false
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

-- Corrige les 15 lignes déjà écrites ce soir avec le mauvais source par
-- défaut ('manuel' au lieu de 'rappel_journee') pour qu'elles apparaissent
-- rétroactivement dans l'historique automatique. Ciblé strictement sur le
-- titre/corps du rappel de journée et la fenêtre horaire de ce soir, pour ne
-- toucher aucune vraie notification manuelle envoyée par ailleurs.
-- DÉJÀ APPLIQUÉ en direct via l'API (2026-08-04, DML autorisé avec la clé
-- anon) — les 15 lignes sont déjà corrigées. Ce UPDATE est laissé ici pour
-- la doc et est un no-op si réexécuté (plus aucune ligne source='manuel'
-- ne correspond).
UPDATE client_notifications
SET source = 'rappel_journee'
WHERE source = 'manuel'
  AND title = '⏰ N''oublie pas ta journée'
  AND body = 'Pense à valider ta journée avant de dormir !'
  AND created_at >= '2026-08-04T19:00:00+00:00'
  AND created_at <  '2026-08-04T20:00:00+00:00';
