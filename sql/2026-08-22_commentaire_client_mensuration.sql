-- Note libre que le CLIENT peut ajouter à sa propre saisie de mensuration
-- (ex: "période de règles", "voyage, alimentation perturbée"). Distincte de
-- la colonne "note" (2026-08-17_note_mensuration.sql) qui reste une annotation
-- privée du coach, éditable uniquement côté console.
ALTER TABLE mensurations ADD COLUMN IF NOT EXISTS commentaire TEXT;
