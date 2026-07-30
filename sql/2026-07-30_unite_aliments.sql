-- Ajout de la colonne unite pour supporter les aliments en portions ou autres unités
-- unite='g' (défaut) = kcal_par_gramme, quantite_g = grammes (comportement existant)
-- unite='portion' = kcal_par_gramme stocke les macros par portion, quantite_g = nb de portions
ALTER TABLE aliments_coach ADD COLUMN IF NOT EXISTS unite TEXT DEFAULT 'g';
ALTER TABLE repas_aliments ADD COLUMN IF NOT EXISTS unite TEXT DEFAULT 'g';
