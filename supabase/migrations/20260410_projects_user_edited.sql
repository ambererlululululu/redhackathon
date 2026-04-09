-- 标记用户是否手动编辑过项目（区分导入数据 vs 用户修改）
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_edited BOOLEAN DEFAULT FALSE;
