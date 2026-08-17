-- Annotation libre sur une mensuration (ex: "départ en vacances", "retour de vacances")
-- visible/éditable uniquement côté console coach.
ALTER TABLE mensurations ADD COLUMN IF NOT EXISTS note TEXT;
