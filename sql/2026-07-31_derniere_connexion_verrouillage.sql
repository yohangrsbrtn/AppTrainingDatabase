-- Dernière connexion réelle côté Supabase (écrite à chaque login réussi).
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS derniere_connexion TIMESTAMPTZ;

-- Verrouillage d'accès à l'app (distinct de l'ancien verrouillage GAS des Google Sheets) —
-- coupe la connexion Supabase d'un client précis, manuellement, sans toucher aux autres.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS verrouille_app BOOLEAN NOT NULL DEFAULT false;
