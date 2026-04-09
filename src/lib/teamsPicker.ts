import type { Team } from '@/lib/supabase'

/** 与 schema 种子数据一致的占位队名：队伍1、队伍01、队伍123 等 */
const PLACEHOLDER_TEAM_NAME = /^队伍\d+$/

/**
 * 当库里同时存在种子「队伍01…」与 Excel 导入的真实队名时，只展示真实队名，避免下拉被占位占满。
 * 若仅有占位（尚未导入），则仍展示全部。
 */
export function filterTeamsForPicker(teams: Team[]): Team[] {
  const list = teams ?? []
  const hasRealNames = list.some(t => !PLACEHOLDER_TEAM_NAME.test(t.name.trim()))
  const filtered = hasRealNames ? list.filter(t => !PLACEHOLDER_TEAM_NAME.test(t.name.trim())) : list
  return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}
