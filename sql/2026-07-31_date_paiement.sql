-- Échéance de paiement/prélèvement par client, éditable depuis la fiche client (console) — coach only.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS date_paiement DATE;
