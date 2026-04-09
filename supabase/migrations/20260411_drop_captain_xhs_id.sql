-- 身份验证已改为仅使用 verify_phone（队长手机号），删除旧的小红书 ID 字段
ALTER TABLE teams DROP COLUMN IF EXISTS captain_xhs_id;

NOTIFY pgrst, 'reload schema';
