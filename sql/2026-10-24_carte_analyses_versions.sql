-- Analyses de carte de personnage : versions successives d'un même brouillon.
-- Au lieu de remplacer un brouillon non validé, la tâche planifiée (ou le coach qui retape le texte)
-- crée une nouvelle version : l'ancienne passe en statut 'revise' et la nouvelle pointe dessus
-- (revision_de), ce qui permet d'afficher les différences en couleur dans la console.
ALTER TABLE client_carte_analyses ADD COLUMN IF NOT EXISTS scores JSONB;
ALTER TABLE client_carte_analyses ADD COLUMN IF NOT EXISTS revision_de BIGINT REFERENCES client_carte_analyses(id) ON DELETE SET NULL;
ALTER TABLE client_carte_analyses ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE client_carte_analyses ADD COLUMN IF NOT EXISTS auteur TEXT NOT NULL DEFAULT 'ia';
ALTER TABLE client_carte_analyses DROP CONSTRAINT IF EXISTS client_carte_analyses_statut_check;
ALTER TABLE client_carte_analyses ADD CONSTRAINT client_carte_analyses_statut_check CHECK (statut IN ('brouillon','revise','valide','rejete'));
ALTER TABLE client_carte_analyses DROP CONSTRAINT IF EXISTS client_carte_analyses_auteur_check;
ALTER TABLE client_carte_analyses ADD CONSTRAINT client_carte_analyses_auteur_check CHECK (auteur IN ('ia','coach'));

-- Reprise : les brouillons existants récupèrent leurs scores depuis client_carte_personnage.
UPDATE client_carte_analyses a SET scores = s.j
FROM (SELECT client_id, jsonb_object_agg(axe, score) AS j FROM client_carte_personnage WHERE brouillon GROUP BY client_id) s
WHERE a.client_id = s.client_id AND a.statut = 'brouillon' AND a.scores IS NULL;
