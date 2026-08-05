-- Notification push pour le chat commun : UNE seule notification par "vague" de
-- messages non lus (le premier message non lu déclenche le push, les suivants tant
-- que le destinataire n'a pas rouvert le chat ne renvoient rien — pas d'inondation).
-- Activé par défaut, désactivable dans Paramètres (client_notif_prefs.chat_push).
--
-- Nécessite un suivi de lecture CÔTÉ SERVEUR (chat_lecture) distinct du localStorage
-- déjà utilisé pour le badge de non-lus : le push doit pouvoir être décidé même quand
-- l'app est fermée, ce que localStorage ne permet pas (voir project_notifications_push).

-- ── Table de lecture serveur, une ligne par client ─────────────────────────────
CREATE TABLE IF NOT EXISTS chat_lecture (
  client_id     TEXT PRIMARY KEY REFERENCES client_profils(client_id) ON DELETE CASCADE,
  dernier_lu_id BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Préférence, activée par défaut ──────────────────────────────────────────────
ALTER TABLE client_notif_prefs ADD COLUMN IF NOT EXISTS chat_push BOOLEAN NOT NULL DEFAULT true;

-- ── Trigger : à chaque nouveau message, notifie les destinataires pour qui ce
-- message est le PREMIER non lu depuis leur dernière lecture (dernier_lu_id) —
-- s'il existe déjà un message non lu antérieur à celui-ci pour ce destinataire,
-- on ne renvoie pas de push (il en a déjà reçu un pour ce lot). Isolation par
-- destinataire (BEGIN/EXCEPTION) : une ligne corrompue ne doit jamais annuler
-- tout le lot, cf. piège déjà rencontré sur les autres rappels pg_cron/trigger.
CREATE OR REPLACE FUNCTION _chat_notifier_nouveaux_messages() RETURNS trigger AS $$
DECLARE
  v_expediteur TEXT;
  r RECORD;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.pseudo), ''), p.prenom, 'Quelqu''un') INTO v_expediteur
  FROM client_profils p WHERE p.client_id = NEW.client_id;
  IF v_expediteur IS NULL THEN v_expediteur := 'Quelqu''un'; END IF;

  FOR r IN
    SELECT p.client_id
    FROM client_profils p
    LEFT JOIN client_notif_prefs np ON np.client_id = p.client_id
    LEFT JOIN chat_lecture cl ON cl.client_id = p.client_id
    WHERE p.client_id != NEW.client_id
      AND COALESCE(np.push_actif, true)
      AND COALESCE(np.chat_push, true)
      AND NOT EXISTS (
        SELECT 1 FROM chat_messages m
        WHERE m.client_id != p.client_id
          AND m.id > COALESCE(cl.dernier_lu_id, 0)
          AND m.id < NEW.id
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
          'title', '💬 ' || v_expediteur,
          'body', LEFT(NEW.texte, 120),
          'client_id', r.client_id,
          'page', 'chat'
        )
      );
      INSERT INTO client_notifications (client_id, title, body, source, page)
      VALUES (r.client_id, '💬 ' || v_expediteur, LEFT(NEW.texte, 120), 'chat', 'chat');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS chat_messages_notify ON chat_messages;
CREATE TRIGGER chat_messages_notify
AFTER INSERT ON chat_messages
FOR EACH ROW EXECUTE FUNCTION _chat_notifier_nouveaux_messages();
