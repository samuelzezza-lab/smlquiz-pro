-- Keep the privileged, data-minimizing source view in the non-exposed private schema.
-- The public API view runs with invoker permissions and exposes only the sanitized projection.
ALTER VIEW public.exam_experiences_public SET SCHEMA private;

CREATE VIEW public.exam_experiences_public
WITH (security_invoker = true, security_barrier = true)
AS SELECT * FROM private.exam_experiences_public;

GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT SELECT ON private.exam_experiences_public TO anon, authenticated;
GRANT SELECT ON public.exam_experiences_public TO anon, authenticated;
