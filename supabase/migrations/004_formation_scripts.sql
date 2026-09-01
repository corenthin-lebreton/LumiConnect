-- Migration 004 — Sélection de scripts par formation
--
-- Porte les cases à cocher du formulaire de création : quels scripts de configuration seront
-- exécutés dans chaque VM après le démarrage.

-- `os_id` est déduit du nom du template au moment de la création et détermine quelle
-- bibliothèque de scripts s'applique. `template_name` fige la révision employée : quand une VM
-- se comporte mal, on sait sur quelle version du template elle a été clonée, même si le
-- template a été reconstruit depuis.
ALTER TABLE formations ADD COLUMN os_id         TEXT;
ALTER TABLE formations ADD COLUMN template_name TEXT;

CREATE TABLE formation_scripts (
  formation_id UUID    NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  script_id    TEXT    NOT NULL,
  position     INTEGER NOT NULL,
  PRIMARY KEY (formation_id, script_id)
);

CREATE INDEX formation_scripts_order ON formation_scripts (formation_id, position);

ALTER TABLE formation_scripts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON formation_scripts FROM anon;

-- Écrit par la session utilisateur au moment de créer la formation, lu par le worker via la
-- service role key.
CREATE POLICY formation_scripts_authenticated ON formation_scripts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Le contenu des scripts n'est volontairement pas stocké ici : seuls les identifiants le sont.
-- Les scripts eux-mêmes vivent dans le dépôt, sous scripts/<os_id>/, et n'arrivent donc jamais
-- par une saisie web. C'est ce qui empêche cette table de devenir un vecteur d'exécution de
-- code arbitraire en SYSTEM/root sur les machines de formation.
