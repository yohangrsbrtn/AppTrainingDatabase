-- Pseudo (surnom affiché à la place du nom, notamment dans le classement) et photo de
-- profil, réglables par le client lui-même depuis l'app mobile (Paramètres > Profil).
--
-- ÉTAPE MANUELLE PRÉALABLE (impossible via la clé anon, à faire dans le Dashboard Supabase) :
--   Storage → New bucket → nom EXACT "profils-photos" → cocher "Public bucket" → Create.
-- Une fois le bucket créé, exécuter ce fichier dans le SQL editor Supabase.

ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS pseudo TEXT;
ALTER TABLE client_profils ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Policies sur le bucket "profils-photos" (RLS storage.objects) — même modèle que
-- "bilans-photos" (RLS ouverte à anon, pas d'auth Supabase pour l'instant).
DROP POLICY IF EXISTS "profils-photos public read" ON storage.objects;
CREATE POLICY "profils-photos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'profils-photos');
DROP POLICY IF EXISTS "profils-photos anon upload" ON storage.objects;
CREATE POLICY "profils-photos anon upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'profils-photos');
DROP POLICY IF EXISTS "profils-photos anon delete" ON storage.objects;
CREATE POLICY "profils-photos anon delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'profils-photos');
