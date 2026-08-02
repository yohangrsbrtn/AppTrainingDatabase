-- Date/heure à laquelle le coach a marqué un bilan traité — permet de trier
-- la section "Traités · 15 derniers jours" par ordre de traitement réel
-- (le plus récemment traité en haut), au lieu de la date d'envoi du bilan.
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS coach_traite_at TIMESTAMPTZ;
