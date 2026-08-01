-- Mode simplifié : jusqu'ici un réglage purement local (localStorage), donc
-- invisible des autres clients — impossible d'exclure ces clients du
-- classement des autres (qui lit tous les clients depuis Supabase). On le
-- persiste maintenant côté serveur ; localStorage reste un cache local pour
-- un rendu synchrone (les fonctions d'affichage ne peuvent pas attendre un
-- fetch), resynchronisé depuis Supabase à chaque chargement de l'accueil.
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS mode_simplifie BOOLEAN NOT NULL DEFAULT false;
