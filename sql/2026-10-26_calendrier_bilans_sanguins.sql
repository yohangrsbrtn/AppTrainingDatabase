-- Calendrier de bilans sanguins pour les clients sous protocole (console → Protocole → onglets Calendrier / Modèles / Règles).
--  * bilan_sanguin_modeles : un « bilan type » = liste de marqueurs + conditions (si un résultat précédent dépasse un seuil, on ajoute des marqueurs).
--  * bilan_sanguin_regles  : quand le faire dans un protocole (référence début/fin du protocole, décalage en semaines, fenêtre en jours) et avec quel modèle.
--  * client_bilans_sanguins : les échéances planifiées d'un client (générées depuis les règles ou ajoutées à la main). Le statut « fait / en retard »
--    n'est JAMAIS stocké : il est calculé à partir des analyses saisies (client_analyses_sante) dans la fenêtre.
CREATE TABLE IF NOT EXISTS bilan_sanguin_modeles (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  description TEXT,
  marqueurs JSONB NOT NULL DEFAULT '[]',
  conditions JSONB NOT NULL DEFAULT '[]',   -- [{marqueur, op:'>'|'<', valeur, ajouter:[...], motif}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bilan_sanguin_regles (
  id BIGSERIAL PRIMARY KEY,
  libelle TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT 'debut' CHECK (ref IN ('debut','fin')),
  decalage_semaines INTEGER NOT NULL DEFAULT 0,       -- négatif = avant la référence
  duree_fenetre_jours INTEGER NOT NULL DEFAULT 7,
  modele_id BIGINT REFERENCES bilan_sanguin_modeles(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS client_bilans_sanguins (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  regle_id BIGINT REFERENCES bilan_sanguin_regles(id) ON DELETE SET NULL,
  modele_id BIGINT REFERENCES bilan_sanguin_modeles(id) ON DELETE SET NULL,
  libelle TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  marqueurs_extra JSONB NOT NULL DEFAULT '[]',
  note TEXT,
  annule BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bilans_sanguins_client ON client_bilans_sanguins(client_id, date_debut);
ALTER TABLE bilan_sanguin_modeles DISABLE ROW LEVEL SECURITY;
ALTER TABLE bilan_sanguin_regles DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_bilans_sanguins DISABLE ROW LEVEL SECURITY;
GRANT ALL ON bilan_sanguin_modeles, bilan_sanguin_regles, client_bilans_sanguins TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE bilan_sanguin_modeles_id_seq, bilan_sanguin_regles_id_seq, client_bilans_sanguins_id_seq TO anon, authenticated;
