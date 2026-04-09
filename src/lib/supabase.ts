import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type TeamMember = {
  name: string
  role: string
  bio: string
}

export type Project = {
  id?: string
  team_id: number
  project_name: string
  team_intro: TeamMember[]
  one_liner: string
  inspiration: string
  solution: string
  highlight: string
  links: string[]
  ppt_url: string
  screenshots: string[]
  demo_qr_url: string
  is_submitted: boolean
  created_at?: string
  updated_at?: string
}

export type Team = {
  id: number
  name: string
  track: string
  /** 队伍宣言，由后台/导入维护（teams 表）；未迁移库时可能为空 */
  team_declaration?: string
}

/**
 * projects.screenshots JSONB → 展示用 URL 列表（与 ProjectForm 写入的 string[] 一致）。
 * 兼容：数组、JSON 字符串、单条 URL 字符串等。
 */
export function parseScreenshotUrls(raw: unknown): string[] {
  if (raw == null) return []
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return []
    if (t.startsWith('[')) {
      try {
        return parseScreenshotUrls(JSON.parse(t) as unknown)
      } catch {
        return [t]
      }
    }
    return [t]
  }
  if (Array.isArray(raw)) {
    return raw
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter((u): u is string => u.length > 0)
  }
  return []
}
