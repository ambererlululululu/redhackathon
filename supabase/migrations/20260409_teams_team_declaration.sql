-- 在 Supabase → SQL Editor 中执行（仅需一次）
-- 为 teams 增加队伍宣言，并刷新 teams_public 视图

ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_declaration TEXT NOT NULL DEFAULT '';

ALTER TABLE projects DROP COLUMN IF EXISTS team_declaration;

DROP VIEW IF EXISTS teams_public;
CREATE VIEW teams_public AS SELECT id, name, track, team_declaration FROM teams;
GRANT SELECT ON teams_public TO anon, authenticated;

-- 让 PostgREST 重新加载 schema（可选，多数环境会自动刷新）
NOTIFY pgrst, 'reload schema';
