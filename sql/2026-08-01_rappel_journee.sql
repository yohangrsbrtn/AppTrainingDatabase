-- Préférences de notifications automatiques par client (interrupteur général
-- "Notifications" dans Paramètres + réglages fins par type de rappel).
-- N'affecte QUE les rappels automatiques (ce fichier) — les messages envoyés
-- manuellement par le coach depuis la console passent toujours, quel que soit
-- ce réglage (c'est un message direct, pas une relance automatique).
CREATE TABLE IF NOT EXISTS client_notif_prefs (
  client_id TEXT PRIMARY KEY REFERENCES client_profils(client_id),
  push_actif BOOLEAN NOT NULL DEFAULT true,
  rappel_journee BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rappel "n'oublie pas de valider ta journée" à 21h30 heure de Paris, pour
-- tout client dont le bilan en cours n'a pas encore le jour du jour validé.
--
-- Le job pg_cron tourne toutes les 15 min en UTC fixe (pg_cron ne suit pas
-- le changement d'heure été/hiver) — c'est la fonction elle-même qui vérifie
-- l'heure LOCALE de Paris et ne fait quelque chose qu'entre 21h30 et 21h44,
-- ce qui gère le passage heure d'été/hiver automatiquement sans jamais avoir
-- à retoucher le cron.
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

  -- Même convention que côté client (index.html _jourIdxAujourdhui) : Lundi=0
  -- ... Dimanche=6, avec un décalage -2h pour qu'une saisie après minuit
  -- compte encore pour la veille.
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
    INSERT INTO client_notifications (client_id, title, body)
    VALUES (r.client_id, '⏰ N''oublie pas ta journée', 'Pense à valider ta journée avant de dormir !');
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.unschedule('rappel-journee') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rappel-journee');
SELECT cron.schedule('rappel-journee', '*/15 * * * *', 'SELECT _rappel_journee_non_validee();');
