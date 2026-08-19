-- Miniature/gif de démonstration par exercice (catalogue exercices, pas par instance de programme).
-- Source : gifs hébergés gratuitement sur CDN jsDelivr (repo ExerciseGymGifsDB), style illustration
-- anatomique filaire. gif_url NULL = pas de démo dispo, l'app n'affiche rien dans ce cas.
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS gif_url TEXT;
