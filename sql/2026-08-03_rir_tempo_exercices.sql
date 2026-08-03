-- Ajoute RIR et Tempo par bloc (Métabolique/Mécanique/Force) à la bibliothèque d'exercices,
-- même principe que reps_*/repos_* déjà existants — permet de personnaliser RIR/tempo par
-- exercice au lieu de retomber uniquement sur les valeurs génériques par type de bloc.
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS rir_metabolique TEXT;
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS rir_mecanique TEXT;
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS rir_force TEXT;
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS tempo_metabolique TEXT;
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS tempo_mecanique TEXT;
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS tempo_force TEXT;
