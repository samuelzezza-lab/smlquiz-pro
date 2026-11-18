CREATE OR REPLACE FUNCTION public.get_semestre_filtro_free_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'auth', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_used integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Devi accedere per visualizzare le simulazioni gratuite';
  END IF;
  SELECT count(*)::integer INTO v_used
  FROM public.semestre_filtro_tentativi
  WHERE user_id = v_user_id AND access_type = 'free';
  RETURN jsonb_build_object(
    'free_used', least(5, v_used),
    'free_remaining', greatest(0, 5 - v_used)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_semestre_filtro_free_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_semestre_filtro_free_usage() TO authenticated;
