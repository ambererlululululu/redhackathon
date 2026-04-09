import ExcelJS from 'exceljs'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Buffer as NodeBuffer } from 'buffer'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

type TeamRow = {
  id: number
  name: string
  track: string
  team_declaration: string | null
}

type TeamMember = {
  name?: string
  role?: string
  bio?: string
}

type ProjectRow = {
  id: string
  team_id: number
  project_name: string | null
  one_liner: string | null
  inspiration: string | null
  solution: string | null
  highlight: string | null
  links: unknown
  ppt_url: string | null
  screenshots: unknown
  demo_qr_url: string | null
  is_submitted: boolean
  updated_at: string | null
  created_at: string | null
  team_intro: unknown
}

function safeString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function toStringArray(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) return v.map(safeString).map(s => s.trim()).filter(Boolean)
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return []
    if (t.startsWith('[')) {
      try {
        return toStringArray(JSON.parse(t) as unknown)
      } catch {
        return [t]
      }
    }
    return [t]
  }
  return [safeString(v)].map(s => s.trim()).filter(Boolean)
}

function normalizeMembers(raw: unknown): TeamMember[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(Boolean)
    .map((m) => (typeof m === 'object' && m ? (m as TeamMember) : ({} as TeamMember)))
}

function membersToCell(raw: unknown): string {
  const members = normalizeMembers(raw)
  const lines = members
    .map((m) => {
      const name = (m.name ?? '').trim()
      const role = (m.role ?? '').trim()
      const bio = (m.bio ?? '').trim()
      if (!name && !role && !bio) return ''
      const head = [name, role ? `(${role})` : ''].join('').trim()
      return [head, bio].filter(Boolean).join('：')
    })
    .filter(Boolean)
  return lines.join('\n')
}

type ImagePayload = {
  buffer: NodeBuffer
  extension: 'png' | 'jpeg'
}

async function fetchImage(url: string): Promise<ImagePayload | null> {
  const u = url.trim()
  if (!u) return null
  try {
    const res = await fetch(u, { cache: 'no-store' })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    const ab = await res.arrayBuffer()
    const buffer = NodeBuffer.from(ab)
    if (!buffer.length) return null
    if (ct.includes('png')) return { buffer, extension: 'png' }
    if (ct.includes('jpeg') || ct.includes('jpg')) return { buffer, extension: 'jpeg' }
    // fallback by sniffing
    const sig = buffer.subarray(0, 4).toString('hex')
    if (sig === '89504e47') return { buffer, extension: 'png' }
    if (sig.startsWith('ffd8')) return { buffer, extension: 'jpeg' }
    return null
  } catch {
    return null
  }
}

function addImageToCell(sheet: ExcelJS.Worksheet, workbook: ExcelJS.Workbook, payload: ImagePayload, row: number, col: number) {
  const imageId = workbook.addImage({
    // exceljs types lag behind Node Buffer typings in TS5; runtime is fine
    buffer: payload.buffer as any,
    extension: payload.extension,
  })
  // Use A1-style range to avoid Anchor typing issues
  const tl = sheet.getCell(row, col).address
  const br = sheet.getCell(row, Math.min(col + 1, sheet.columnCount || col + 1)).address
  sheet.addImage(imageId, `${tl}:${br}`)
}

export async function GET() {
  const [teamsRes, projectsRes] = await Promise.all([
    supabase.from('teams_public').select('id, name, track, team_declaration').order('id'),
    supabase.from('projects').select('*').eq('is_submitted', true).order('team_id'),
  ])

  if (teamsRes.error || projectsRes.error) {
    return NextResponse.json(
      { error: '导出失败：数据库查询错误' },
      { status: 500 },
    )
  }

  const teams = (teamsRes.data ?? []) as TeamRow[]
  const projects = (projectsRes.data ?? []) as ProjectRow[]
  const teamMap = new Map<number, TeamRow>(teams.map(t => [t.id, t]))

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'hackathon-submit'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('已提交项目', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  sheet.columns = [
    { header: '队伍ID', key: 'team_id', width: 8 },
    { header: '队伍名称', key: 'team_name', width: 18 },
    { header: '队伍宣言', key: 'team_declaration', width: 28 },
    { header: '赛道', key: 'track', width: 10 },
    { header: '项目名称', key: 'project_name', width: 26 },
    { header: '一句话介绍', key: 'one_liner', width: 28 },
    { header: '团队成员', key: 'team_members', width: 34 },
    { header: '灵感来源', key: 'inspiration', width: 34 },
    { header: '解决方案', key: 'solution', width: 40 },
    { header: '最惊艳的地方', key: 'highlight', width: 34 },
    { header: '项目链接', key: 'links', width: 40 },
    { header: 'PPT链接', key: 'ppt_url', width: 34 },
    { header: '截图链接', key: 'screenshots', width: 40 },
    { header: 'Demo二维码', key: 'demo_qr_url', width: 34 },
    { header: '更新时间', key: 'updated_at', width: 20 },
  ]

  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).alignment = { vertical: 'middle' }

  for (const p of projects) {
    const t = teamMap.get(p.team_id)
    sheet.addRow({
      team_id: p.team_id,
      team_name: t?.name ?? '',
      team_declaration: (t?.team_declaration ?? '').toString(),
      track: t?.track ?? '',
      project_name: (p.project_name ?? '').toString(),
      one_liner: (p.one_liner ?? '').toString(),
      team_members: membersToCell(p.team_intro),
      inspiration: (p.inspiration ?? '').toString(),
      solution: (p.solution ?? '').toString(),
      highlight: (p.highlight ?? '').toString(),
      links: toStringArray(p.links).join('\n'),
      ppt_url: (p.ppt_url ?? '').toString(),
      screenshots: toStringArray(p.screenshots).join('\n'),
      demo_qr_url: (p.demo_qr_url ?? '').toString(),
      updated_at: (p.updated_at ?? '').toString(),
    })
  }

  sheet.eachRow((row, rowNumber) => {
    row.alignment = {
      vertical: 'top',
      wrapText: true,
    }
    if (rowNumber > 1) row.height = 54
  })

  // Media sheet: embed images for easy offline review
  const media = workbook.addWorksheet('图片', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  media.columns = [
    { header: '队伍ID', key: 'team_id', width: 8 },
    { header: '队伍名称', key: 'team_name', width: 18 },
    { header: '项目名称', key: 'project_name', width: 26 },
    { header: '截图1', key: 's1', width: 22 },
    { header: '截图2', key: 's2', width: 22 },
    { header: '截图3', key: 's3', width: 22 },
    { header: '截图4', key: 's4', width: 22 },
    { header: 'Demo二维码', key: 'qr', width: 18 },
    { header: '截图链接(原始)', key: 's_urls', width: 40 },
    { header: '二维码链接(原始)', key: 'qr_url', width: 40 },
  ]
  media.getRow(1).font = { bold: true }

  // Fetch & embed images (best-effort). Keep it sequential to avoid bandwidth spikes.
  let mediaRow = 2
  for (const p of projects) {
    const t = teamMap.get(p.team_id)
    const screenshotUrls = toStringArray(p.screenshots).slice(0, 4)
    const qrUrl = (p.demo_qr_url ?? '').trim()

    media.addRow({
      team_id: p.team_id,
      team_name: t?.name ?? '',
      track: t?.track ?? '',
      project_name: (p.project_name ?? '').toString(),
      s_urls: screenshotUrls.join('\n'),
      qr_url: qrUrl,
    })

    // Make room for thumbnails
    const rowObj = media.getRow(mediaRow)
    rowObj.height = 120
    rowObj.alignment = { vertical: 'middle', wrapText: true }

    // screenshots in col 4..7
    for (let i = 0; i < 4; i++) {
      const url = screenshotUrls[i]
      if (!url) continue
      const payload = await fetchImage(url)
      if (payload) addImageToCell(media, workbook, payload, mediaRow, 4 + i)
    }

    if (qrUrl) {
      const payload = await fetchImage(qrUrl)
      if (payload) addImageToCell(media, workbook, payload, mediaRow, 8)
    }

    mediaRow++
  }

  const buf = await workbook.xlsx.writeBuffer()
  const ymd = new Date().toISOString().slice(0, 10)
  const filename = `submitted-projects-${ymd}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=\"${filename}\"`,
      'Cache-Control': 'no-store',
    },
  })
}

