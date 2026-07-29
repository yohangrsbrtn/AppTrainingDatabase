-- Fix: client_dietes était lié à diete_templates uniquement par nom (colonne `nom`),
-- ce qui provoque une résolution vers le MAUVAIS template quand deux clients ont une
-- diète du même nom (ex: "Diète jour training" réutilisé pour plusieurs clients lors
-- de migrations client_only) : la recherche `diete_templates?nom=eq.X&order=id.desc&limit=1`
-- ramène le template le plus récent portant ce nom, pas forcément celui du bon client.
ALTER TABLE client_dietes ADD COLUMN IF NOT EXISTS diete_template_id BIGINT REFERENCES diete_templates(id);
