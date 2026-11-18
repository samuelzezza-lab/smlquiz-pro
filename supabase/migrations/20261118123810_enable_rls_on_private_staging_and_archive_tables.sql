-- Server-only staging and archive tables: keep them inaccessible to client roles.
-- Service-role and owner-side backend workers continue to bypass RLS as intended.
ALTER TABLE private.domande_quiz1_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.question_quality_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quizmind_anatomia_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quizmind_antropologia_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quizmind_architetture_calcolatori_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quizmind_architetture_software_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quizmind_astrofisica_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quizmind_biologia_vegetale_staging ENABLE ROW LEVEL SECURITY;
