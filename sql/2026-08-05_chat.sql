-- Chat commun : un seul salon visible par tous les clients + le coach (pas de
-- messages privés) — demande explicite du coach ("un chat où tout le monde
-- peut se parler"), en temps réel (Supabase Realtime, pas de rafraîchissement
-- manuel).

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_profils(client_id),
  texte TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- Indispensable pour que Realtime diffuse les nouveaux messages en direct —
-- sans cette ligne, les INSERT fonctionnent (lus/écrits via l'API REST comme
-- toutes les autres tables) mais aucun événement temps réel n'est émis, les
-- clients devraient recharger la page pour voir les nouveaux messages.
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
