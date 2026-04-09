/**
 * 评审「一页纸」版式：按约 36 字/行（11px、A4 版心）估算，
 * 用「折算行数」同时约束手动换行与文本框内自动折行，避免印不下。
 */
export const COLS_PER_LINE = 36

/** 各文本区块允许的最大折算行数（见 effectivePrintLines） */
export const LINE_LIMITS = {
  /** 队伍宣言在 teams 表维护，单行展示 */
  team_declaration: 1,
  one_liner: 3,
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

type ProjectLike = {
  one_liner?: string
  inspiration?: string
  solution?: string
  highlight?: string
  team_intro?: unknown
}

/** 任一区块超过折算行数时，一页纸底部截图略缩小（兼容旧数据） */
export function shouldCompactScreenshots(project: ProjectLike, teamDeclaration = ''): boolean {
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

/**
 * 估算「截图区块」以上正文的折算行数（与表单 line-clamp 一致的量级），用于按比例缩小底部截图。
 */
export function estimateOnepageAboveLines(project: ProjectLike, teamName: string, teamDeclaration: string): number {
  let lines = 0
  lines += effectivePrintLines(project.one_liner ?? '', COLS_PER_LINE)
  lines += effectivePrintLines(teamName ?? '', COLS_PER_LINE)
  lines += effectivePrintLines(teamDeclaration ?? '', COLS_PER_LINE)
  lines += effectivePrintLines(project.inspiration ?? '', COLS_PER_LINE)
  lines += effectivePrintLines(project.solution ?? '', COLS_PER_LINE)
  lines += effectivePrintLines(project.highlight ?? '', COLS_PER_LINE)
  const members = Array.isArray(project.team_intro) ? project.team_intro : []
  for (const m of members) {
    if (!m || typeof m !== 'object') continue
    const name = String((m as { name?: string }).name ?? '').trim()
    if (!name) continue
    lines += 1
    lines += effectivePrintLines(String((m as { bio?: string }).bio ?? ''), COLS_PER_LINE)
  }
  return lines
}

/** 0 最大 … 3 最紧凑；上方越长档位越高 */
export type ScreenshotMediaTier = 0 | 1 | 2 | 3

const LINE_TIER_1 = 20
const LINE_TIER_2 = 32
const LINE_TIER_3 = 44

export function getScreenshotMediaTier(
  project: ProjectLike,
  teamName: string,
  teamDeclaration: string,
): ScreenshotMediaTier {
  const lines = estimateOnepageAboveLines(project, teamName, teamDeclaration)
  let tier: ScreenshotMediaTier = 0
  if (lines > LINE_TIER_1) tier = 1
  if (lines > LINE_TIER_2) tier = 2
  if (lines > LINE_TIER_3) tier = 3
  if (shouldCompactScreenshots(project, teamDeclaration)) {
    tier = Math.max(tier, 1) as ScreenshotMediaTier
    if (lines > LINE_TIER_2 - 4) tier = Math.max(tier, 2) as ScreenshotMediaTier
  }
  return tier
}

/** Tailwind：截图 max-height */
export const SCREENSHOT_MAX_H_CLASS: Record<ScreenshotMediaTier, string> = {
  0: 'max-h-[200px]',
  1: 'max-h-[168px]',
  2: 'max-h-[136px]',
  3: 'max-h-[112px]',
}

/** Demo 二维码图片尺寸 */
export const DEMO_QR_IMG_CLASS: Record<ScreenshotMediaTier, string> = {
  0: 'w-20 h-20',
  1: 'w-[72px] h-[72px]',
  2: 'w-16 h-16',
  3: 'w-14 h-14',
}

/** Demo 二维码列：须容下标题单行，宽度随档位仅影响二维码图（见 DEMO_QR_IMG_CLASS） */
const DEMO_QR_COL_BASE = 'w-max min-w-[8rem] shrink-0'
export const DEMO_QR_COL_CLASS: Record<ScreenshotMediaTier, string> = {
  0: DEMO_QR_COL_BASE,
  1: DEMO_QR_COL_BASE,
  2: DEMO_QR_COL_BASE,
  3: DEMO_QR_COL_BASE,
}
