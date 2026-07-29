-- Support d'un vrai flux d'authentification pour les clients supabase_only :
-- - mdp_defini : passe à true dès qu'un mot de passe a été créé (signUp réussi).
--   Permet de savoir à l'avance si le client doit voir l'écran "connexion" ou
--   "création de mot de passe", au lieu de le déduire de l'erreur générique
--   que Supabase renvoie aussi bien pour "mauvais mot de passe" que pour
--   "compte inexistant" (anti-enumeration volontaire).
-- - email_confirme : passe à true une fois que le client a renseigné et confirmé
--   une vraie adresse email (remplace l'email fictif <client_id>@apptraining-users.com
--   utilisé pour l'auth Supabase), ce qui active la récupération de mot de passe.
-- À exécuter dans l'éditeur SQL Supabase.

ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS mdp_defini BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS email_confirme BOOLEAN NOT NULL DEFAULT false;

-- yohanp a déjà créé son mot de passe (compte de test existant).
UPDATE client_profils SET mdp_defini = true WHERE client_id = 'yohanp';
