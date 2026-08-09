-- Détail du calcul XP d'un bilan (base/diète/séances/pas/ponctualité/série), stocké au
-- moment du crédit pour pouvoir l'afficher plus tard (écran client + détail bilan console)
-- sans avoir à tout recalculer rétroactivement (le streak dépend de l'état à ce moment-là,
-- pas de l'état actuel).
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS xp_detail JSONB;
