-- Colonne Calories dans le suivi coach (client_suivi), + clé stable pour
-- l'import idempotent des entrées historiques depuis la feuille "Suivi" GAS.
ALTER TABLE client_suivi ADD COLUMN IF NOT EXISTS calories TEXT;
ALTER TABLE client_suivi ADD COLUMN IF NOT EXISTS gas_row INTEGER;
-- Phase (Cut/Reverse/Prise de masse/...) — mêmes libellés que la Roadmap et les
-- mensurations (ROADMAP_TYPES côté console.html), texte libre pour rester tolérant
-- aux valeurs historiques GAS non normalisées.
ALTER TABLE client_suivi ADD COLUMN IF NOT EXISTS phase TEXT;

-- Une même ligne GAS ne doit jamais être importée deux fois pour un même client.
-- Index NON partiel volontairement : PostgREST ne peut pas cibler un index
-- partiel via ?on_conflict=. Pas un problème pour les entrées créées à la main
-- (gas_row=NULL) — deux NULL ne sont jamais considérés égaux par une contrainte
-- unique, donc elles ne se bloquent jamais entre elles.
CREATE UNIQUE INDEX IF NOT EXISTS client_suivi_gas_row_uniq
  ON client_suivi(client_id, gas_row);
