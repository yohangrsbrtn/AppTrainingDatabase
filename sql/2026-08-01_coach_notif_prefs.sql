-- Préférences de notifications du coach (bilan reçu / séance validée /
-- journée validée) + journal d'événements réels pour le dashboard "Activité
-- récente" de la console (remplace l'ancien flux basé sur chaque log de
-- charge/reps individuel, trop bruyant et faussement étiqueté "Séance
-- validée" alors que ce n'était qu'une série sauvegardée).

-- Une seule ligne (id=1) : préférences globales du coach, appliquées à
-- TOUS ses appareils abonnés (console + mobile partagent le même
-- client_id='yohanp' dans push_subscriptions).
CREATE TABLE IF NOT EXISTS coach_notif_prefs (
  id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bilan_recu       BOOLEAN NOT NULL DEFAULT true,
  seance_validee   BOOLEAN NOT NULL DEFAULT true,
  journee_validee  BOOLEAN NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO coach_notif_prefs (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Journal des événements réels (un par validation effective), avec timestamp
-- exact — contrairement à bilans.jours (simples flags par jour de semaine,
-- sans horodatage), ce qui permet de reconstruire une vraie chronologie pour
-- le dashboard.
CREATE TABLE IF NOT EXISTS activite_events (
  id         BIGSERIAL PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES client_profils(client_id) ON DELETE CASCADE,
  type       TEXT NOT NULL, -- 'bilan_envoye' | 'seance_validee' | 'journee_validee'
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activite_events_created ON activite_events(created_at DESC);

-- Bilan envoyé : ajoute l'event + gate le push par la préférence coach.
CREATE OR REPLACE FUNCTION _trg_push_bilan_envoye() RETURNS trigger AS $$
DECLARE
  v_nom text;
  v_actif boolean;
BEGIN
  IF NEW.envoye_coach = true AND (TG_OP = 'INSERT' OR OLD.envoye_coach IS DISTINCT FROM true) THEN
    INSERT INTO activite_events (client_id, type, meta)
      VALUES (NEW.client_id, 'bilan_envoye', jsonb_build_object('semaine_label', NEW.semaine_label));
    SELECT bilan_recu INTO v_actif FROM coach_notif_prefs WHERE id = 1;
    IF COALESCE(v_actif, true) THEN
      SELECT COALESCE(NULLIF(trim(prenom || ' ' || nom), ''), client_id) INTO v_nom FROM client_profils WHERE client_id = NEW.client_id;
      PERFORM _envoyer_push('📋 Bilan reçu', COALESCE(v_nom, 'Un client') || ' vient d''envoyer son bilan.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Séance / journée validée : idem, ajoute l'event + gate par préférence.
CREATE OR REPLACE FUNCTION _trg_push_jour_valide() RETURNS trigger AS $$
DECLARE
  v_nom text;
  v_seances_avant int;
  v_seances_apres int;
  v_jours_avant int;
  v_jours_apres int;
  v_pref_seance boolean;
  v_pref_journee boolean;
BEGIN
  SELECT count(*) INTO v_seances_avant FROM jsonb_array_elements(COALESCE(OLD.jours,'[]'::jsonb)) e WHERE (e->>'seance_validee')::boolean;
  SELECT count(*) INTO v_seances_apres FROM jsonb_array_elements(COALESCE(NEW.jours,'[]'::jsonb)) e WHERE (e->>'seance_validee')::boolean;
  SELECT count(*) INTO v_jours_avant   FROM jsonb_array_elements(COALESCE(OLD.jours,'[]'::jsonb)) e WHERE (e->>'valide')::boolean;
  SELECT count(*) INTO v_jours_apres   FROM jsonb_array_elements(COALESCE(NEW.jours,'[]'::jsonb)) e WHERE (e->>'valide')::boolean;

  IF v_seances_apres > v_seances_avant OR v_jours_apres > v_jours_avant THEN
    SELECT seance_validee, journee_validee INTO v_pref_seance, v_pref_journee FROM coach_notif_prefs WHERE id = 1;
    IF v_seances_apres > v_seances_avant THEN
      INSERT INTO activite_events (client_id, type) VALUES (NEW.client_id, 'seance_validee');
      IF COALESCE(v_pref_seance, true) THEN
        SELECT COALESCE(NULLIF(trim(prenom || ' ' || nom), ''), client_id) INTO v_nom FROM client_profils WHERE client_id = NEW.client_id;
        PERFORM _envoyer_push('💪 Séance validée', COALESCE(v_nom, 'Un client') || ' vient de valider sa séance du jour.');
      END IF;
    END IF;
    IF v_jours_apres > v_jours_avant THEN
      INSERT INTO activite_events (client_id, type) VALUES (NEW.client_id, 'journee_validee');
      IF COALESCE(v_pref_journee, true) THEN
        SELECT COALESCE(NULLIF(trim(prenom || ' ' || nom), ''), client_id) INTO v_nom FROM client_profils WHERE client_id = NEW.client_id;
        PERFORM _envoyer_push('✅ Journée validée', COALESCE(v_nom, 'Un client') || ' vient de valider sa journée.');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
