-- Defense in depth: the worklist is backend-only and intentionally has no client policies or grants.
ALTER TABLE public.quizmind_subject_worklist ENABLE ROW LEVEL SECURITY;
