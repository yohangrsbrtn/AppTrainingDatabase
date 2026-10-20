-- Carte de personnage : brouillons proposés automatiquement (analyse des photos par la tâche
-- planifiée du coach), à relire et valider dans la console. Un brouillon est un jeu de lignes
-- brouillon = true pour un mois donné ; la carte affichée au client n'utilise que brouillon = false.
-- Axes spéciaux dans la même table : 'Définition' (score 0-100), 'Gras min' / 'Gras max' (% estimés).
ALTER TABLE client_carte_personnage ADD COLUMN IF NOT EXISTS brouillon BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE client_carte_personnage DROP CONSTRAINT IF EXISTS client_carte_personnage_client_id_mois_axe_key;
ALTER TABLE client_carte_personnage ADD CONSTRAINT client_carte_personnage_unique UNIQUE (client_id, mois, axe, brouillon);
