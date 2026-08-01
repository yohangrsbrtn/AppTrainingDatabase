-- Historique des envois groupés du coach (une ligne = un clic sur "Envoyer",
-- qu'il vise un client ou "tous"), séparé de client_notifications qui est
-- l'inbox vivante du client (peut être vidée sans perdre la trace de l'envoi).
CREATE TABLE IF NOT EXISTS notif_envois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  plein_ecran BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'manuel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Destinataires visés par un envoi, conservé même si la ligne client_notifications
-- correspondante est supprimée côté client (colonne supprime = true dans ce cas) —
-- permet d'afficher "envoyé à : ..." dans l'historique coach indéfiniment.
CREATE TABLE IF NOT EXISTS notif_envoi_destinataires (
  id BIGSERIAL PRIMARY KEY,
  envoi_id UUID NOT NULL REFERENCES notif_envois(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  supprime BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(envoi_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_notif_envoi_dest_envoi ON notif_envoi_destinataires(envoi_id);

-- Lien vers l'envoi d'origine + flag plein écran sur l'inbox client existante.
ALTER TABLE client_notifications ADD COLUMN IF NOT EXISTS envoi_id UUID REFERENCES notif_envois(id) ON DELETE SET NULL;
ALTER TABLE client_notifications ADD COLUMN IF NOT EXISTS plein_ecran BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_client_notifications_envoi ON client_notifications(envoi_id);
