-- Journal d'entraînement personnel côté client (pour l'instant réservé à
-- yohanp côté UI) — totalement séparé du système "programme" assigné par le
-- coach (client_programmes/_blocs/_seances/_exercices). Même principe que
-- Mes menus / Mon journal côté diète : une bibliothèque perso de séances
-- réutilisables + un journal qui log les charges par date réelle.

CREATE TABLE IF NOT EXISTS client_seances_perso (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  nom TEXT NOT NULL,
  bloc TEXT,               -- étiquette libre pour grouper ("Force Août", "Push A"...), optionnelle
  date_debut DATE,         -- optionnelle, juste indicative pour situer le bloc dans le temps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seances_perso_client ON client_seances_perso(client_id);

CREATE TABLE IF NOT EXISTS client_exercices_perso (
  id BIGSERIAL PRIMARY KEY,
  seance_perso_id BIGINT NOT NULL REFERENCES client_seances_perso(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  exercice_id BIGINT REFERENCES exercices(id),  -- optionnel, pour retrouver le groupe musculaire si l'exercice existe dans la bibliothèque coach
  ordre INT NOT NULL DEFAULT 0,
  series INT,
  reps TEXT,        -- texte libre ("8-12", "amrap"...) comme côté programme coach
  repos TEXT,
  tempo TEXT,
  rir TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_exercices_perso_seance ON client_exercices_perso(seance_perso_id);

CREATE TABLE IF NOT EXISTS client_logs_perso (
  id BIGSERIAL PRIMARY KEY,
  exercice_perso_id BIGINT NOT NULL REFERENCES client_exercices_perso(id) ON DELETE CASCADE,
  date DATE NOT NULL,      -- date réelle d'exécution (pas un numéro de semaine — usage libre)
  numero_serie INT NOT NULL,
  charge NUMERIC,
  reps NUMERIC,
  rir NUMERIC,
  commentaire TEXT,
  UNIQUE(exercice_perso_id, date, numero_serie)
);
CREATE INDEX IF NOT EXISTS idx_logs_perso_exercice_date ON client_logs_perso(exercice_perso_id, date);
