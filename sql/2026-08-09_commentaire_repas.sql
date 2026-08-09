-- Commentaire du coach sur un repas précis (ex: "ajouter de la levure"), visible côté client
-- dans l'app mobile. Le commentaire d'une diète entière existe déjà (diete_templates.description,
-- resté interne au coach jusqu'ici) — rendu visible au client en même temps, voir diete.js.
ALTER TABLE repas ADD COLUMN IF NOT EXISTS commentaire TEXT;
