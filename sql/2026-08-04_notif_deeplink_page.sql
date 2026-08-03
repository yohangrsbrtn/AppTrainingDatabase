-- Deep-link : quand le coach envoie une notification liée à une page précise
-- (ex: Roadmap mise à jour), le clic sur la notification (push OU cloche
-- dans l'app) doit amener directement le client sur cette page au lieu de
-- juste ouvrir le panneau de notifications.
ALTER TABLE client_notifications ADD COLUMN IF NOT EXISTS page TEXT;
