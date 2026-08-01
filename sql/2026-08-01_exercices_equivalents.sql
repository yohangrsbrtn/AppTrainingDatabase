-- Exercice équivalent créé par le client quand une machine/exercice prévu
-- n'est pas disponible (panne, salle bondée...). Un seul équivalent autorisé
-- par exercice du programme (UNIQUE sur programme_exercice_id) — les cibles
-- (séries/reps/repos/tempo) ne sont PAS dupliquées ici : l'app réaffiche
-- celles de l'exercice prévu, seuls le nom et les logs sont propres à
-- l'équivalent.
CREATE TABLE IF NOT EXISTS client_programme_exercices_equivalents (
  id BIGSERIAL PRIMARY KEY,
  programme_exercice_id BIGINT NOT NULL UNIQUE REFERENCES client_programme_exercices(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  exercice_id BIGINT REFERENCES exercices(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_exo_equiv_programme_exercice ON client_programme_exercices_equivalents(programme_exercice_id);

-- Logs de charge/reps/RIR loggués sur l'exercice équivalent, table séparée de
-- client_programme_logs pour ne jamais toucher aux contraintes/patterns
-- existants de cette dernière (voir mémoire projet).
CREATE TABLE IF NOT EXISTS client_programme_logs_equivalents (
  id BIGSERIAL PRIMARY KEY,
  equivalent_id BIGINT NOT NULL REFERENCES client_programme_exercices_equivalents(id) ON DELETE CASCADE,
  semaine INT NOT NULL,
  numero_serie INT NOT NULL,
  charge NUMERIC,
  reps INTEGER,
  rir TEXT,
  commentaire TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(equivalent_id, semaine, numero_serie)
);
CREATE INDEX IF NOT EXISTS idx_cp_logs_equiv_equivalent ON client_programme_logs_equivalents(equivalent_id);
