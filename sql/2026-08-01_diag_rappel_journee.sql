-- Diagnostic en LECTURE SEULE : reproduit exactement la requête de
-- _rappel_journee_non_validee() SANS la contrainte horaire (21h30-21h45) ni
-- l'envoi du push, pour voir qui serait ciblé si le job tournait maintenant.
CREATE OR REPLACE FUNCTION _diag_rappel_journee_candidats() RETURNS TABLE(client_id text, bilan_id bigint, v_idx int) AS $$
DECLARE
  v_idx int;
BEGIN
  v_idx := (EXTRACT(DOW FROM (now() AT TIME ZONE 'Europe/Paris' - interval '2 hours'))::int + 6) % 7;
  RETURN QUERY
  SELECT b.client_id, b.id, v_idx
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
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
