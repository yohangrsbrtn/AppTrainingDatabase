-- Le trigger de notification chat (2026-08-05_chat_push_notif.sql) envoyait le texte brut
-- du message en corps de notification — pour un GIF, c'est l'URL complète (Giphy), illisible
-- et moche dans une notif push. Détection alignée sur _estUrlGif (api.js) : URL seule se
-- terminant en .gif/.webp, ou lien media Giphy → corps de notif "🎞️ GIF" à la place.
CREATE OR REPLACE FUNCTION _chat_notifier_nouveaux_messages() RETURNS trigger AS $$
DECLARE
  v_expediteur TEXT;
  v_body TEXT;
  r RECORD;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.pseudo), ''), p.prenom, 'Quelqu''un') INTO v_expediteur
  FROM client_profils p WHERE p.client_id = NEW.client_id;
  IF v_expediteur IS NULL THEN v_expediteur := 'Quelqu''un'; END IF;

  IF NEW.texte ~* '^https?://\S+\.(gif|webp)(\?\S*)?$' OR NEW.texte ~* '\.giphy\.com/media/' THEN
    v_body := '🎞️ GIF';
  ELSE
    v_body := LEFT(NEW.texte, 120);
  END IF;

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
          'body', v_body,
          'client_id', r.client_id,
          'page', 'chat'
        )
      );
      INSERT INTO client_notifications (client_id, title, body, source, page)
      VALUES (r.client_id, '💬 ' || v_expediteur, v_body, 'chat', 'chat');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
