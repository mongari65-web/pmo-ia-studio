
CREATE TABLE IF NOT EXISTS pmo_history (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tab        TEXT NOT NULL,
  label      TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pmo_history_project_tab
  ON pmo_history(project_id, tab);

ALTER TABLE pmo_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pmo_history'
    AND policyname = 'Users see own project history'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Users see own project history" ON pmo_history
        FOR ALL USING (
          project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
        )
    $p$;
  END IF;
END$$;
