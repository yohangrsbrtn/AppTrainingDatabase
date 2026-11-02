-- Portions d'un aliment : "1 tranche = 30 g" (valeur approximative). Les macros restent pour 100 g, la portion sert juste à convertir en grammes.
ALTER TABLE aliments_communaute ADD COLUMN IF NOT EXISTS portion_g NUMERIC;
ALTER TABLE aliments_communaute ADD COLUMN IF NOT EXISTS portion_nom TEXT;
ALTER TABLE aliments_coach ADD COLUMN IF NOT EXISTS portion_g NUMERIC;
ALTER TABLE aliments_coach ADD COLUMN IF NOT EXISTS portion_nom TEXT;
