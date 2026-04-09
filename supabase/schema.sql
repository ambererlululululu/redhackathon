-- ============================================
-- 黑客松巅峰赛 项目信息收集 数据库 Schema
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================

-- 1. 队伍表
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  track TEXT NOT NULL CHECK (track IN ('软件赛道', '硬件赛道')),
  /** 报名表队长手机号，提交页验证用（不暴露在 teams_public） */
  verify_phone TEXT NOT NULL DEFAULT '',
  captain_name TEXT NOT NULL DEFAULT '',
  team_declaration TEXT NOT NULL DEFAULT ''
);

-- 2. 项目提交表
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_name TEXT DEFAULT '',
  team_intro JSONB DEFAULT '[]'::jsonb,
  team_declaration TEXT DEFAULT '',
  one_liner TEXT DEFAULT '',
  inspiration TEXT DEFAULT '',
  solution TEXT DEFAULT '',
  highlight TEXT DEFAULT '',
  links JSONB DEFAULT '[]'::jsonb,
  ppt_url TEXT DEFAULT '',
  screenshots JSONB DEFAULT '[]'::jsonb,
  demo_qr_url TEXT DEFAULT '',
  is_submitted BOOLEAN DEFAULT FALSE,
  user_edited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每个队伍只能有一个项目
CREATE UNIQUE INDEX idx_projects_team_id ON projects(team_id);

-- 3. 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 4. 开启 RLS (Row Level Security)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 禁止匿名用户直接读取 teams 表（含 verify_phone）
-- 创建只暴露安全字段的视图
CREATE VIEW teams_public AS SELECT id, name, track, team_declaration FROM teams;
GRANT SELECT ON teams_public TO anon, authenticated;

-- teams 表仅允许 service_role 读取（用于服务端验证）
CREATE POLICY "teams_read_service_only" ON teams FOR SELECT USING (false);

-- 允许所有人读写项目(简化版，无需登录)
CREATE POLICY "projects_read" ON projects FOR SELECT USING (true);
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (true);

-- 5. 创建文件存储 bucket (在 Supabase Dashboard > Storage 中创建)
-- bucket name: hackathon-files
-- 设置为 public bucket

-- 6. 可选占位队伍（验证依赖 verify_phone，请用 Excel 导入覆盖为真实数据）
INSERT INTO teams (name, track, team_declaration, verify_phone) VALUES
  ('队伍01', '软件赛道', '', ''),
  ('队伍02', '软件赛道', '', ''),
  ('队伍03', '软件赛道', '', ''),
  ('队伍04', '软件赛道', '', ''),
  ('队伍05', '软件赛道', '', ''),
  ('队伍06', '软件赛道', '', ''),
  ('队伍07', '软件赛道', '', ''),
  ('队伍08', '软件赛道', '', ''),
  ('队伍09', '软件赛道', '', ''),
  ('队伍10', '软件赛道', '', ''),
  ('队伍11', '软件赛道', '', ''),
  ('队伍12', '软件赛道', '', ''),
  ('队伍13', '软件赛道', '', ''),
  ('队伍14', '软件赛道', '', ''),
  ('队伍15', '软件赛道', '', ''),
  ('队伍16', '软件赛道', '', ''),
  ('队伍17', '软件赛道', '', ''),
  ('队伍18', '软件赛道', '', ''),
  ('队伍19', '软件赛道', '', ''),
  ('队伍20', '软件赛道', '', ''),
  ('队伍21', '软件赛道', '', ''),
  ('队伍22', '软件赛道', '', ''),
  ('队伍23', '软件赛道', '', ''),
  ('队伍24', '软件赛道', '', ''),
  ('队伍25', '软件赛道', '', ''),
  ('队伍26', '软件赛道', '', ''),
  ('队伍27', '软件赛道', '', ''),
  ('队伍28', '软件赛道', '', ''),
  ('队伍29', '软件赛道', '', ''),
  ('队伍30', '软件赛道', '', ''),
  ('队伍31', '硬件赛道', '', ''),
  ('队伍32', '硬件赛道', '', ''),
  ('队伍33', '硬件赛道', '', ''),
  ('队伍34', '硬件赛道', '', ''),
  ('队伍35', '硬件赛道', '', ''),
  ('队伍36', '硬件赛道', '', ''),
  ('队伍37', '硬件赛道', '', ''),
  ('队伍38', '硬件赛道', '', ''),
  ('队伍39', '硬件赛道', '', ''),
  ('队伍40', '硬件赛道', '', ''),
  ('队伍41', '硬件赛道', '', ''),
  ('队伍42', '硬件赛道', '', ''),
  ('队伍43', '硬件赛道', '', ''),
  ('队伍44', '硬件赛道', '', ''),
  ('队伍45', '硬件赛道', '', ''),
  ('队伍46', '硬件赛道', '', ''),
  ('队伍47', '硬件赛道', '', ''),
  ('队伍48', '硬件赛道', '', ''),
  ('队伍49', '硬件赛道', '', ''),
  ('队伍50', '硬件赛道', '', ''),
  ('队伍51', '硬件赛道', '', ''),
  ('队伍52', '硬件赛道', '', ''),
  ('队伍53', '硬件赛道', '', ''),
  ('队伍54', '硬件赛道', '', ''),
  ('队伍55', '硬件赛道', '', ''),
  ('队伍56', '硬件赛道', '', ''),
  ('队伍57', '硬件赛道', '', ''),
  ('队伍58', '硬件赛道', '', ''),
  ('队伍59', '硬件赛道', '', '');

-- 确保 teams 表有 team_declaration 列
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_declaration TEXT NOT NULL DEFAULT '';

-- teams_public 视图：隐藏敏感字段（verify_phone, captain_name）
DROP VIEW IF EXISTS teams_public;
CREATE VIEW teams_public AS SELECT id, name, track, team_declaration FROM teams;
GRANT SELECT ON teams_public TO anon, authenticated;
