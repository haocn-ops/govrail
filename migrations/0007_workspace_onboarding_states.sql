CREATE TABLE IF NOT EXISTS workspace_onboarding_states (
  state_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  last_bootstrapped_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_onboarding_states_workspace
  ON workspace_onboarding_states (workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_onboarding_states_org_status_updated
  ON workspace_onboarding_states (organization_id, status, updated_at DESC);
