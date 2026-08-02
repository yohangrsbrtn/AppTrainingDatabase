-- Pastille "modifié" sur un aliment de diète, visible côté app mobile client.
-- Cochée manuellement par le coach dans l'éditeur (console.html), ou activée
-- automatiquement quand le coach change le grammage d'un aliment existant.
ALTER TABLE repas_aliments ADD COLUMN IF NOT EXISTS modifie BOOLEAN NOT NULL DEFAULT false;
