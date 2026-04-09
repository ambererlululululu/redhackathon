-- 队长手机号（与决赛队伍信息表 H 列一致），用于提交页验证；不加入 teams_public
ALTER TABLE teams ADD COLUMN IF NOT EXISTS verify_phone TEXT NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
