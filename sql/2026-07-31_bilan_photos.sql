-- Photos attachées à un bilan (progression physique, etc.)
--
-- ÉTAPE MANUELLE PRÉALABLE (impossible via la clé anon, à faire dans le Dashboard Supabase) :
--   Storage → New bucket → nom EXACT "bilans-photos" → cocher "Public bucket" → Create.
-- Une fois le bucket créé, exécuter ce fichier dans le SQL editor Supabase.

CREATE TABLE IF NOT EXISTS bilan_photos (
  id BIGSERIAL PRIMARY KEY,
  bilan_id BIGINT NOT NULL REFERENCES bilans(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bilan_photos_bilan ON bilan_photos(bilan_id);
CREATE INDEX IF NOT EXISTS idx_bilan_photos_client ON bilan_photos(client_id);

-- Policies sur le bucket "bilans-photos" (RLS storage.objects) — même modèle de
-- confiance que le reste du projet (RLS ouverte à anon, pas d'auth Supabase).
-- DROP POLICY IF EXISTS avant chaque CREATE : rend le script rejouable sans erreur
-- "policy already exists" si une policy a déjà été créée lors d'un essai précédent.
DROP POLICY IF EXISTS "bilans-photos public read" ON storage.objects;
CREATE POLICY "bilans-photos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'bilans-photos');
DROP POLICY IF EXISTS "bilans-photos anon upload" ON storage.objects;
CREATE POLICY "bilans-photos anon upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'bilans-photos');
DROP POLICY IF EXISTS "bilans-photos anon delete" ON storage.objects;
CREATE POLICY "bilans-photos anon delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'bilans-photos');
