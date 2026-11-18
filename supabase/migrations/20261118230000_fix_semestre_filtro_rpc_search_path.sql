-- The RPCs were hardened with an empty search_path, but still call auth.uid()
-- and auth.jwt() without schema qualification. Restore a safe explicit path so
-- authenticated identity resolution works while keeping pg_catalog first.
ALTER FUNCTION public.start_semestre_filtro_exam(text)
  SET search_path = pg_catalog, auth, public, pg_temp;

ALTER FUNCTION public.submit_semestre_filtro_exam(uuid, jsonb)
  SET search_path = pg_catalog, auth, public, pg_temp;
