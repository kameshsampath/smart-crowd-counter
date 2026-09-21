CREATE SCHEMA IF NOT EXISTS crowd_counter;
REVOKE ALL ON SCHEMA crowd_counter FROM PUBLIC;
CREATE TABLE IF NOT EXISTS crowd_counter.session_locations (
  stage_fqn text NOT NULL,
  relative_path text NOT NULL,
  latitude double precision,
  longitude double precision,
  uploaded_at timestamptz NOT NULL,
  PRIMARY KEY (stage_fqn, relative_path),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
ALTER TABLE crowd_counter.session_locations ENABLE ROW LEVEL SECURITY;
DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'crowd_counter'
      AND tablename = 'session_locations' AND policyname = 'crowd_stage_scope') THEN
    CREATE POLICY crowd_stage_scope ON crowd_counter.session_locations
      TO crowd_counter_runtime
      USING (stage_fqn = 'CROWD_COUNTER_DB.CONFERENCES.SNAPS')
      WITH CHECK (stage_fqn = 'CROWD_COUNTER_DB.CONFERENCES.SNAPS');
  END IF;
END
$block$;
GRANT USAGE ON SCHEMA crowd_counter TO crowd_counter_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON crowd_counter.session_locations TO crowd_counter_runtime;