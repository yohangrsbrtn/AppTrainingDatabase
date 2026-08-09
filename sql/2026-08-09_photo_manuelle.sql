-- Ajout manuel d'une photo par le coach (onglet Photos, fiche client), pas forcément liée à un
-- bilan précis — bilan_id devient optionnel, et `date` porte la date choisie par le coach quand
-- il n'y a pas de bilan pour la fournir (bilans.date_validation sert de date dans ce cas-là).
ALTER TABLE bilan_photos ALTER COLUMN bilan_id DROP NOT NULL;
ALTER TABLE bilan_photos ADD COLUMN IF NOT EXISTS date DATE;
