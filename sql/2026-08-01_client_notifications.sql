-- Historique des notifications envoyées par le coach à un client (indépendant
-- du push : sert à afficher la cloche 🔔 + badge non lus dans l'app mobile,
-- même si le client n'a pas activé les notifications push sur son appareil).
CREATE TABLE IF NOT EXISTS client_notifications (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_notifications_client ON client_notifications(client_id);
