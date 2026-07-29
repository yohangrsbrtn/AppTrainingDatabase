-- Mes menus + Mon journal (client) + base d'aliments communauté
-- À exécuter dans l'éditeur SQL Supabase avant de tester la fonctionnalité.

CREATE TABLE client_menus (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  nom TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_menu_aliments (
  id BIGSERIAL PRIMARY KEY,
  menu_id BIGINT NOT NULL REFERENCES client_menus(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  quantite_g NUMERIC NOT NULL,
  kcal NUMERIC NOT NULL DEFAULT 0,
  prot NUMERIC NOT NULL DEFAULT 0,
  glu NUMERIC NOT NULL DEFAULT 0,
  sucres NUMERIC,
  fibres NUMERIC,
  lip NUMERIC NOT NULL DEFAULT 0,
  ags NUMERIC,
  ordre INT NOT NULL DEFAULT 0
);

CREATE TABLE client_journal (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  date DATE NOT NULL,
  slot INT,
  type TEXT NOT NULL CHECK (type IN ('coach','menu','cible')),
  ref TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX client_journal_slot_uniq  ON client_journal(client_id, date, slot) WHERE type <> 'cible';
CREATE UNIQUE INDEX client_journal_cible_uniq ON client_journal(client_id, date) WHERE type = 'cible';

CREATE TABLE aliments_communaute (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  kcal_par_gramme NUMERIC NOT NULL DEFAULT 0,
  prot_par_gramme NUMERIC NOT NULL DEFAULT 0,
  glu_par_gramme NUMERIC NOT NULL DEFAULT 0,
  sucres_par_gramme NUMERIC,
  fibres_par_gramme NUMERIC,
  lip_par_gramme NUMERIC NOT NULL DEFAULT 0,
  ags_par_gramme NUMERIC,
  code_barre TEXT,
  valide BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_menus          DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_menu_aliments  DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_journal        DISABLE ROW LEVEL SECURITY;
ALTER TABLE aliments_communaute   DISABLE ROW LEVEL SECURITY;
