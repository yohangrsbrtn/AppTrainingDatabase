-- Banque utilisée par le client pour ses virements (Qonto/Revolut/Crédit Agricole/Sumeria/Autre)
-- — affichée en fiche client et dans l'espace Facturation, éditable dans les deux.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS banque_paiement TEXT;
