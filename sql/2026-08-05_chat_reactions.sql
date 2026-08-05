-- Réactions emoji sur les messages du chat commun. Un client peut réagir à un message
-- avec plusieurs émojis différents, mais pas deux fois avec le même (toggle : cliquer
-- une réaction déjà posée la retire).

CREATE TABLE IF NOT EXISTS chat_reactions (
  id         BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL REFERENCES client_profils(client_id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, client_id, emoji)
);

-- Indispensable pour que les ajouts/retraits de réaction arrivent en temps réel chez
-- tout le monde (même piège que chat_messages : sans ça, INSERT/DELETE fonctionnent
-- mais aucun événement Realtime n'est émis).
ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions;
