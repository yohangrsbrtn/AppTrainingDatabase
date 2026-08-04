-- Diagnostic : le rappel "N'oublie pas ta journée" n'a JAMAIS envoyé une
-- seule notification depuis sa création (2026-08-01) — client_notifications
-- ne contient aucune ligne avec ce titre, alors que le rappel de bilan
-- (mécanisme identique) fonctionne bien. Cause trouvée : un bilan corrompu
-- (id 535, client_id = '' — chaîne vide, pas NULL) traînait dans les bilans
-- "en cours" et faisait planter l'INSERT dans client_notifications (contrainte
-- FK) à chaque exécution du job pg_cron. Le fichier
-- sql/2026-08-01_fix_rappel_journee_isolation.sql avait déjà écrit le correctif
-- (chaque client dans son propre bloc BEGIN/EXCEPTION) mais on ne peut pas
-- confirmer depuis ici qu'il a bien été exécuté — ce fichier le réapplique
-- (CREATE OR REPLACE, sans risque si déjà fait) pour en être certain, et
-- applique en plus la même protection à _rappel_bilan_a_envoyer (qui n'avait
-- jamais eu ce correctif, même si aucune preuve qu'il ait déjà planté).
--
-- Le bilan corrompu (id 535, créé 2026-08-03, entièrement vide) a été
-- supprimé directement (DELETE, pas d'archivage — aucune donnée réelle à
-- perdre).

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
      -- Un client cassé (FK, contrainte, client_id vide...) ne doit jamais
      -- empêcher les autres de recevoir leur rappel.
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
      INSERT INTO client_notifications (client_id, title, body) VALUES (r.client_id, v_titre, v_corps);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
