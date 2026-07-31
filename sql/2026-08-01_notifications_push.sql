-- Notifications push (coach) : bilan envoyé, séance validée, journée validée.
-- Web Push natif (pas de Firebase) — nécessite le déploiement de la fonction
-- supabase/functions/send-push (voir instructions fournies séparément).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_client ON push_subscriptions(client_id);

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Appelle l'Edge Function send-push (fire-and-forget, asynchrone via pg_net).
CREATE OR REPLACE FUNCTION _envoyer_push(p_title text, p_body text) RETURNS void AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://sfacjbwiczwkcjpwneyg.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYWNqYndpY3p3a2NqcHduZXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjgzNTAsImV4cCI6MjEwMDIwNDM1MH0.mrjPbOuQROMihzxZWrUNbncQIos0jK2VexpQDoRZXzY'
    ),
    body := jsonb_build_object('title', p_title, 'body', p_body, 'client_id', 'yohanp')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bilan envoyé au coach (envoye_coach passe à true, à l'insert ou à la mise à jour).
CREATE OR REPLACE FUNCTION _trg_push_bilan_envoye() RETURNS trigger AS $$
DECLARE
  v_nom text;
BEGIN
  IF NEW.envoye_coach = true AND (TG_OP = 'INSERT' OR OLD.envoye_coach IS DISTINCT FROM true) THEN
    SELECT COALESCE(NULLIF(trim(prenom || ' ' || nom), ''), client_id) INTO v_nom FROM client_profils WHERE client_id = NEW.client_id;
    PERFORM _envoyer_push('📋 Bilan reçu', COALESCE(v_nom, 'Un client') || ' vient d''envoyer son bilan.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_push_bilan_envoye ON bilans;
CREATE TRIGGER trg_push_bilan_envoye
  AFTER INSERT OR UPDATE OF envoye_coach ON bilans
  FOR EACH ROW EXECUTE FUNCTION _trg_push_bilan_envoye();

-- Séance / journée validée : diff du jsonb "jours" (compte de séance_validee/valide
-- avant vs après — pas de colonne dédiée, ce sont des flags par jour dans le bilan
-- en cours de remplissage, voir programme-client.js pcValiderSeance()).
CREATE OR REPLACE FUNCTION _trg_push_jour_valide() RETURNS trigger AS $$
DECLARE
  v_nom text;
  v_seances_avant int;
  v_seances_apres int;
  v_jours_avant int;
  v_jours_apres int;
BEGIN
  SELECT count(*) INTO v_seances_avant FROM jsonb_array_elements(COALESCE(OLD.jours,'[]'::jsonb)) e WHERE (e->>'seance_validee')::boolean;
  SELECT count(*) INTO v_seances_apres FROM jsonb_array_elements(COALESCE(NEW.jours,'[]'::jsonb)) e WHERE (e->>'seance_validee')::boolean;
  SELECT count(*) INTO v_jours_avant   FROM jsonb_array_elements(COALESCE(OLD.jours,'[]'::jsonb)) e WHERE (e->>'valide')::boolean;
  SELECT count(*) INTO v_jours_apres   FROM jsonb_array_elements(COALESCE(NEW.jours,'[]'::jsonb)) e WHERE (e->>'valide')::boolean;

  IF v_seances_apres > v_seances_avant OR v_jours_apres > v_jours_avant THEN
    SELECT COALESCE(NULLIF(trim(prenom || ' ' || nom), ''), client_id) INTO v_nom FROM client_profils WHERE client_id = NEW.client_id;
    IF v_seances_apres > v_seances_avant THEN
      PERFORM _envoyer_push('💪 Séance validée', COALESCE(v_nom, 'Un client') || ' vient de valider sa séance du jour.');
    END IF;
    IF v_jours_apres > v_jours_avant THEN
      PERFORM _envoyer_push('✅ Journée validée', COALESCE(v_nom, 'Un client') || ' vient de valider sa journée.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_push_jour_valide ON bilans;
CREATE TRIGGER trg_push_jour_valide
  AFTER UPDATE OF jours ON bilans
  FOR EACH ROW EXECUTE FUNCTION _trg_push_jour_valide();
