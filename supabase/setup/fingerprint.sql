-- One row per object in the public schema, with a hash of its definition.
-- Run on dev and prod and compare: any row that differs (or is missing) is drift.
-- Used by `npm run db:status -- --drift`.
select 'fn' as kind, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name, md5(pg_get_functiondef(p.oid)) as hash
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'
union all
select 'col', c.table_name || '.' || c.column_name, md5(c.data_type || coalesce(c.column_default, '') || c.is_nullable)
  from information_schema.columns c where c.table_schema = 'public'
union all
select 'idx', indexname, md5(indexdef) from pg_indexes where schemaname = 'public'
union all
select 'pol', tablename || '.' || policyname, md5(coalesce(qual, '') || coalesce(with_check, '') || cmd || roles::text)
  from pg_policies where schemaname = 'public'
union all
select 'trg', tgrelid::regclass || '.' || tgname, md5(pg_get_triggerdef(oid))
  from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'public.%'
union all
select 'con', conrelid::regclass || '.' || conname, md5(pg_get_constraintdef(oid))
  from pg_constraint where connamespace = 'public'::regnamespace
order by 1, 2;
