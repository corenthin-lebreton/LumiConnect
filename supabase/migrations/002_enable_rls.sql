-- Migration 002 — Réactivation de Row Level Security
--
-- La migration 001 se terminait par DISABLE ROW LEVEL SECURITY sur les trois tables.
-- Combiné aux grants Supabase par défaut sur le schéma public, cela rendait
-- formations.vm_password et formation_vms.guac_password lisibles avec la seule clé anon,
-- laquelle est publique : elle est embarquée dans le bundle navigateur via
-- NEXT_PUBLIC_SUPABASE_ANON_KEY.

ALTER TABLE formations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_vms   ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_logs ENABLE ROW LEVEL SECURITY;

-- Défense en profondeur : aucune de ces tables n'est censée être atteinte sans session.
REVOKE ALL ON formations      FROM anon;
REVOKE ALL ON formation_vms   FROM anon;
REVOKE ALL ON deployment_logs FROM anon;

-- Les pages serveur (app/(dashboard)/**) interrogent ces tables avec la session de
-- l'utilisateur, donc sous le rôle `authenticated`. Le périmètre ci-dessous reproduit
-- exactement le comportement actuel de l'application : tout membre connecté voit toutes
-- les formations, comme le fait déjà la liste de app/(dashboard)/formations/page.tsx.
--
-- Restreindre la lecture au créateur (USING (created_by = auth.uid())) est une décision
-- produit, pas un correctif de sécurité : cela empêcherait un formateur de reprendre la
-- formation d'un collègue. À trancher séparément.

CREATE POLICY formations_authenticated ON formations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY formation_vms_authenticated ON formation_vms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY deployment_logs_authenticated ON deployment_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- L'orchestrateur et le nettoyage utilisent la service role key, qui contourne RLS.
-- C'est voulu : ils s'exécutent hors session utilisateur.
