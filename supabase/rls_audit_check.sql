-- ════════════════════════════════════════════════════════════════════════════
--  JunglePharm — Audit RLS
--  Colle ce SQL dans : https://supabase.com/dashboard/project/psuqzlcxwuqnkssgasts/sql/new
--  et vérifie que toutes les tables ont RLS = ✅ et 4 policies chacune.
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  t.table_name                                      AS "Table",
  CASE WHEN c.rls_enabled THEN '✅ ON' ELSE '❌ OFF' END AS "RLS",
  CASE WHEN c.rls_forced  THEN '✅ FORCE' ELSE '⚠ NO FORCE' END AS "FORCE",
  COUNT(p.policyname)::int                          AS "Nb politiques",
  string_agg(p.cmd, ' | ' ORDER BY p.cmd)          AS "Commandes couvertes"
FROM
  information_schema.tables t
  JOIN pg_class c ON c.relname = t.table_name
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LEFT JOIN pg_policies p ON p.tablename = t.table_name AND p.schemaname = 'public'
WHERE
  t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT IN ('schema_migrations', 'spatial_ref_sys')
GROUP BY t.table_name, c.rls_enabled, c.rls_forced
ORDER BY
  c.rls_enabled ASC,   -- tables sans RLS en premier (problèmes en haut)
  t.table_name;
