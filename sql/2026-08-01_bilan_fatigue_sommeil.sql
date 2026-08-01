-- Bilan client : ajoute fatigue générale + qualité du sommeil (notation 1-5
-- + commentaire chacune), affichées sous les jours de la semaine.
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS fatigue_generale SMALLINT;
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS commentaire_fatigue TEXT;
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS qualite_sommeil SMALLINT;
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS commentaire_sommeil TEXT;
