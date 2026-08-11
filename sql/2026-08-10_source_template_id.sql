-- Trace le template dont provient un programme client, pour la liste "Assignés" d'un template
-- (console.html → Templates → 👥) et pour détecter si le contenu du client a divergé depuis.
-- Avant ce champ, "Assignés" retrouvait les clients par correspondance de NOM avec le template
-- (client_programmes.nom = programme_templates.nom) — cassé dès que le client (ou le coach)
-- renommait le programme. FK nullable, ON DELETE SET NULL (supprimer le template ne doit jamais
-- supprimer le programme du client, juste perdre la trace de son origine).
ALTER TABLE client_programmes
  ADD COLUMN IF NOT EXISTS source_template_id INTEGER REFERENCES programme_templates(id) ON DELETE SET NULL;
