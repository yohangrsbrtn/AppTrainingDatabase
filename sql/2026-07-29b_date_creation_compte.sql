-- Date de création du compte (issue du fichier Excel de log clients de la PWA) —
-- distincte de date_debut ("Début du coaching"). Sert de référence pour calculer
-- le nombre de séances/bilans attendus depuis la création du compte.
-- À exécuter dans l'éditeur SQL Supabase.

ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS date_creation_compte DATE;
