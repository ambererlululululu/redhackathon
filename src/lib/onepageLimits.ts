/**
 * 评审「一页纸」版式：按约 36 字/行（11px、A4 版心）估算，
 * 用「折算行数」同时约束手动换行与文本框内自动折行，避免印不下。
 */
export const COLS_PER_LINE = 36

/** 各文本区块允许的最大折算行数（见 effectivePrintLines） */
export const LINE_LIMITS = {
  /** 队伍宣言在 teams 表维护，单行展示 */
  team_declaration: 1,
  one_liner: 2,
  inspiration: 4,
  solution: 6,
  highlight: 4,
  /** 每位成员履历：单行语义（名+角色后剩余宽度约一行） */
  member_bio: 1,
} as const

/** 字数上限 = 行数 × 每行字数（与折算行数一致） */
export const CHAR_LIMITS = {
  team_declaration: LINE_LIMITS.team_declaration * COLS_PER_LINE,
  one_liner: LINE_LIMITS.one_liner * COLS_PER_LINE,
  inspiration: LINE_LIMITS.inspiration * COLS_PER_LINE,
  solution: LINE_LIMITS.solution * COLS_PER_LINE,
  highlight: LINE_LIMITS.highlight * COLS_PER_LINE,
  member_bio: LINE_LIMITS.member_bio * COLS_PER_LINE,
} as const

export const MAX_TEAM_MEMBERS = 6

/** 仅统计手动换行（\n），不含文本框内自动折行 — 不适合版面估算 */
export function countManualLines(text: string): number {
  const t = text ?? ''
  if (!t.trim()) return 0
  return t.split(/\r?\n/).length
}

/**
 * 按版心宽度估算「折算行数」：无换行时长文按 colsPerLine 折行；
 * 含手动换行时，每段分别折算；空行占 1 行。
 */
export function effectivePrintLines(text: string, colsPerLine: number): number {
  const t = text ?? ''
  if (!t.trim()) return 0
  const parts = t.split(/\r?\n/)
  let total = 0
  for (const part of parts) {
    if (part.length === 0) {
      total += 1
    } else {
      total += Math.max(1, Math.ceil(part.length / colsPerLine))
    }
  }
  return total
}

/** 从末尾删字直到折算行数不超过 maxLines */
export function clampToEffectiveLines(text: string, maxLines: number, colsPerLine: number): string {
  let v = text
  while (v.length > 0 && effectivePrintLines(v, colsPerLine) > maxLines) {
    v = v.slice(0, -1)
  }
  return v
}

/** 截断到最多 maxLines 个手动换行段（保留旧逻辑供极少场景使用） */
export function clampLines(text: string, maxLines: number): string {
  const parts = text.split(/\r?\n/)
  if (parts.length <= maxLines) return text
  return parts.slice(0, maxLines).join('\n')
}

/** 任一区块超过折算行数时，一页纸底部截图略缩小（兼容旧数据） */
export function shouldCompactScreenshots(
  project: {
    one_liner?: string
    inspiration?: string
    solution?: string
    highlight?: string
    team_intro?: unknown
  },
  teamDeclaration = '',
): boolean {
  const d = teamDeclaration ?? ''
  const o = project.one_liner ?? ''
  const i = project.inspiration ?? ''
  const s = project.solution ?? ''
  const h = project.highlight ?? ''
  if (effectivePrintLines(d, COLS_PER_LINE) > LINE_LIMITS.team_declaration) return true
  if (effectivePrintLines(o, COLS_PER_LINE) > LINE_LIMITS.one_liner) return true
  if (effectivePrintLines(i, COLS_PER_LINE) > LINE_LIMITS.inspiration) return true
  if (effectivePrintLines(s, COLS_PER_LINE) > LINE_LIMITS.solution) return true
  if (effectivePrintLines(h, COLS_PER_LINE) > LINE_LIMITS.highlight) return true
  const members = Array.isArray(project.team_intro) ? project.team_intro : []
  if (members.length > MAX_TEAM_MEMBERS) return true
  for (const m of members) {
    if (m && typeof m === 'object' && 'bio' in m) {
      const bio = String((m as { bio?: string }).bio ?? '')
      if (effectivePrintLines(bio, COLS_PER_LINE) > LINE_LIMITS.member_bio) return true
    }
  }
  return false
}
