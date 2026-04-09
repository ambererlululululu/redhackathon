#!/usr/bin/env node
/**
 * 从 Excel 读取队伍 + 项目信息，生成 SQL 或直接写入 Supabase。
 *
 * 工作表：「0410-0点提交信息」（可用 --sheet= 覆盖）。
 * 列映射：
 *   B=赛道  D=队伍名称  E=项目名称  F=一句话队伍介绍
 *   G=一句话项目介绍  H=队伍成员名  I=Github链接  J=小红书链接
 *
 * 用法：
 *   node scripts/import-team-info-xlsx.mjs                                    # 干跑，输出 SQL
 *   node --env-file=.env.local scripts/import-team-info-xlsx.mjs --execute    # 增量导入（保留已编辑/已提交）
 *   node --env-file=.env.local scripts/import-team-info-xlsx.mjs --execute --force  # 强制全量（清空重建）
 *   node scripts/import-team-info-xlsx.mjs --sheet=其他表名 /path/to/file.xlsx
 */

import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_FILENAME = '黑巅2026-决赛队伍信息.xlsx'
const DEFAULT_SHEET_NAME = '0410-0点提交信息'

/* ── CLI args ─────────────────────────────────────────── */

function parseArgs(argv) {
  let startRow = 2
  let filePath = null
  let execute = false
  let sheetName = DEFAULT_SHEET_NAME
  let force = false
  for (const a of argv) {
    if (a === '--execute') { execute = true; continue }
    if (a === '--force') { force = true; continue }
    if (a.startsWith('--start-row=')) { startRow = Math.max(1, parseInt(a.split('=')[1], 10) || 2); continue }
    if (a.startsWith('--sheet=')) { sheetName = a.slice('--sheet='.length).trim() || DEFAULT_SHEET_NAME; continue }
    if (!a.startsWith('-')) filePath = a
  }
  return { startRow, filePath, execute, force, sheetName }
}

function resolveDefaultXlsx() {
  const roots = [process.cwd(), path.join(process.cwd(), '..'), path.join(__dirname, '..', '..')]
  for (const root of roots) {
    const p = path.join(root, 'project info', DEFAULT_FILENAME)
    if (fs.existsSync(p)) return p
  }
  return path.join(process.cwd(), 'project info', DEFAULT_FILENAME)
}

/* ── Helpers ──────────────────────────────────────────── */

function mapTrack(raw) {
  const v = String(raw ?? '').trim().replace(/\s/g, '')
  if (!v) return null
  if (v.includes('软件')) return '软件赛道'
  if (v.includes('硬件')) return '硬件赛道'
  return null
}

function sqlString(s) {
  return "'" + String(s ?? '').replace(/'/g, "''") + "'"
}

/** 只存数字 */
function normalizePhoneForStorage(raw) {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.round(raw))
  return String(raw).replace(/\D/g, '')
}

function normalizeCellText(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 解析成员名：自动识别分隔符（、，, 换行 空格）
 * 返回 TeamMember[] 格式：[{name, role, bio}]
 */
function parseMembers(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return []

  let parts
  if (text.includes('、')) {
    parts = text.split('、')
  } else if (text.includes('；')) {
    parts = text.split('；')
  } else if (text.includes('，')) {
    parts = text.split('，')
  } else if (text.includes(',')) {
    parts = text.split(',')
  } else if (text.includes(';')) {
    parts = text.split(';')
  } else if (text.includes('\n')) {
    parts = text.split('\n')
  } else {
    // 空格分隔（中文名字之间用空格）
    parts = text.split(/\s+/)
  }

  return parts
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, role: '', bio: '' }))
}

/**
 * 提取所有 URL：支持多个链接，清理尾部标点
 */
function extractUrls(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return []
  // 匹配 http(s):// 或裸 github.com 开头的链接
  const matches = text.match(/(?:https?:\/\/|(?=github\.com\/))[^\s，。、！？\u3000]+/g)
  if (!matches) return []
  return matches.map((u) => {
    // 补全协议
    if (!u.startsWith('http')) u = 'https://' + u
    // 清理尾部分号等
    return u.replace(/[;；,，]+$/, '')
  })
}

function getWorksheet(workbook, sheetName) {
  const sheet = workbook.getWorksheet(sheetName)
  if (sheet) return sheet
  const names = workbook.worksheets.map((w) => w.name).join(', ')
  throw new Error(`找不到工作表「${sheetName}」。当前工作簿中的表：${names || '（无）'}`)
}

/* ── Read Excel ───────────────────────────────────────── */

async function readRows(xlsxPath, startRow, sheetName) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(xlsxPath)
  const sheet = getWorksheet(workbook, sheetName)

  const COL_B = 2   // 赛道
  const COL_C = 3   // 队长名字
  const COL_D = 4   // 队伍名称
  const COL_E = 5   // 项目名称
  const COL_F = 6   // 一句话队伍介绍 → team_declaration
  const COL_G = 7   // 一句话项目介绍 → one_liner
  const COL_H = 8   // 队伍成员名（队长填写，可能包含队长自己）
  const COL_I = 9   // Github 链接
  const COL_J = 10  // 小红书链接
  const COL_K = 11  // 手机号
  const COL_L = 12  // 队伍宣言（优先于 F 列）

  const rows = []
  let skipped = 0

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return

    const cell = (col) => row.getCell(col)
    const txt = (col) => normalizeCellText(cell(col).text ?? cell(col).value ?? '')

    const name = txt(COL_D)
    if (!name) { skipped++; return }

    const trackRaw = cell(COL_B).text ?? cell(COL_B).value
    const track = mapTrack(trackRaw)
    if (!track) {
      console.warn(`[跳过 第 ${rowNumber} 行] 团队「${name}」赛道无法识别: ${JSON.stringify(trackRaw)}`)
      skipped++
      return
    }

    const captainName = txt(COL_C)
    const declaration = txt(COL_L) || txt(COL_F)
    const projectName = txt(COL_E)
    const oneLiner = txt(COL_G)
    const membersRaw = cell(COL_H).text ?? cell(COL_H).value ?? ''
    const rawMembers = parseMembers(membersRaw)
    // 队长放第一个（role=队长），H列成员去掉队长（可能重复写了）
    const otherMembers = captainName
      ? rawMembers.filter((m) => m.name !== captainName)
      : rawMembers
    const members = captainName
      ? [{ name: captainName, role: '队长', bio: '' }, ...otherMembers]
      : rawMembers
    const githubUrls = extractUrls(cell(COL_I).text ?? cell(COL_I).value ?? '')
    const xhsUrls = extractUrls(cell(COL_J).text ?? cell(COL_J).value ?? '')
    const links = [...githubUrls, ...xhsUrls]
    const verifyPhone = normalizePhoneForStorage(cell(COL_K).text ?? cell(COL_K).value ?? '')

    rows.push({ name, track, captainName, declaration, verifyPhone, projectName, oneLiner, members, links, rowNumber })
  })

  return { rows, skipped }
}

/* ── Dry-run SQL ──────────────────────────────────────── */

function printSql(xlsxPath, sheetName, rows, skipped) {
  console.log('-- 自 Excel 导入：', xlsxPath)
  console.log('-- 工作表:', sheetName)
  console.log('-- 数据行数:', rows.length, skipped ? `（跳过/空行约 ${skipped}）` : '')
  console.log('BEGIN;')
  console.log('')
  console.log('-- 清空现有数据')
  console.log('DELETE FROM projects;')
  console.log('DELETE FROM teams;')
  console.log('')

  for (const r of rows) {
    const qName = sqlString(r.name)
    const qTrack = sqlString(r.track)
    const qDecl = sqlString(r.declaration)

    const qPhone = sqlString(r.verifyPhone)
    console.log(
      `INSERT INTO teams (name, track, team_declaration, verify_phone)\n` +
      `VALUES (${qName}, ${qTrack}, ${qDecl}, ${qPhone});\n`,
    )

    const qProject = sqlString(r.projectName)
    const qOneLiner = sqlString(r.oneLiner)
    const qMembers = sqlString(JSON.stringify(r.members))
    const qLinks = sqlString(JSON.stringify(r.links))

    console.log(
      `INSERT INTO projects (team_id, project_name, one_liner, team_intro, links)\n` +
      `VALUES ((SELECT id FROM teams WHERE name = ${qName}), ${qProject}, ${qOneLiner}, ${qMembers}::jsonb, ${qLinks}::jsonb);\n`,
    )
  }

  console.log('COMMIT;')
}

/* ── Execute: write to Supabase ───────────────────────── */

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('缺少环境变量：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY')
    console.error('示例：node --env-file=.env.local scripts/import-team-info-xlsx.mjs --execute')
    process.exit(1)
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * 增量导入（默认）：
 *  - 新队伍 → 插入 team + project
 *  - 已有队伍 → 更新 team 字段；project 仅在 user_edited=false 且 is_submitted=false 时更新
 *  - 不删除任何已有数据
 */
async function executeRowsIncremental(rows) {
  const supabase = createSupabaseClient()

  // 加载现有 teams（按名字索引）
  const { data: existingTeams } = await supabase.from('teams').select('id, name')
  const teamByName = new Map((existingTeams ?? []).map((t) => [t.name, t]))

  // 加载现有 projects（按 team_id 索引）
  const { data: existingProjects } = await supabase.from('projects').select('id, team_id, user_edited, is_submitted')
  const projByTeamId = new Map((existingProjects ?? []).map((p) => [p.team_id, p]))

  let newTeam = 0
  let updTeam = 0
  let newProj = 0
  let updProj = 0
  let skippedProj = 0
  let err = 0

  for (const row of rows) {
    const existing = teamByName.get(row.name)

    if (existing) {
      // ── 已有队伍：更新 team 字段 ──
      const { error: teamErr } = await supabase
        .from('teams')
        .update({
          track: row.track,
          captain_name: row.captainName,
          team_declaration: row.declaration,
          verify_phone: row.verifyPhone,
        })
        .eq('id', existing.id)

      if (teamErr) {
        console.error(`[团队更新失败] ${row.name}:`, teamErr.message)
        err++
        continue
      }
      updTeam++

      // project：仅更新未被用户编辑/提交的
      const proj = projByTeamId.get(existing.id)
      if (proj && (proj.user_edited || proj.is_submitted)) {
        console.log(`[跳过项目] ${row.name}：已${proj.is_submitted ? '提交' : '编辑'}，不覆盖`)
        skippedProj++
      } else if (proj) {
        const { error: projErr } = await supabase
          .from('projects')
          .update({
            project_name: row.projectName,
            team_declaration: row.declaration,
            one_liner: row.oneLiner,
            team_intro: row.members,
            links: row.links,
          })
          .eq('id', proj.id)
        if (projErr) {
          console.error(`[项目更新失败] ${row.name}:`, projErr.message)
          err++
        } else {
          updProj++
        }
      } else {
        // 队伍存在但没有 project → 插入
        const { error: projErr } = await supabase
          .from('projects')
          .insert({
            team_id: existing.id,
            project_name: row.projectName,
            team_declaration: row.declaration,
            one_liner: row.oneLiner,
            team_intro: row.members,
            links: row.links,
            user_edited: false,
          })
        if (projErr) {
          console.error(`[项目插入失败] ${row.name}:`, projErr.message)
          err++
        } else {
          newProj++
        }
      }
    } else {
      // ── 新队伍：插入 team + project ──
      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .insert({
          name: row.name,
          track: row.track,
          captain_name: row.captainName,
          team_declaration: row.declaration,
          verify_phone: row.verifyPhone,
        })
        .select('id')
        .single()

      if (teamErr || !teamData) {
        console.error(`[团队插入失败] ${row.name}:`, teamErr?.message)
        err++
        continue
      }
      newTeam++

      const { error: projErr } = await supabase
        .from('projects')
        .insert({
          team_id: teamData.id,
          project_name: row.projectName,
          team_declaration: row.declaration,
          one_liner: row.oneLiner,
          team_intro: row.members,
          links: row.links,
          user_edited: false,
        })
      if (projErr) {
        console.error(`[项目插入失败] ${row.name}:`, projErr.message)
        err++
      } else {
        newProj++
      }
    }
  }

  console.log(
    `完成：新增团队 ${newTeam}，更新团队 ${updTeam}，` +
    `新增项目 ${newProj}，更新项目 ${updProj}，跳过已编辑 ${skippedProj}，` +
    `失败 ${err}（共 ${rows.length} 条）`,
  )
  if (err > 0) process.exit(1)
}

/**
 * 强制全量导入（--force）：清空全部数据后重新插入，id 从 1 开始。
 * ⚠️ 会丢失所有用户已编辑/已提交的数据！
 */
async function executeRowsForce(rows) {
  const supabase = createSupabaseClient()

  console.log('⚠️  强制模式：清空全部数据...')
  await supabase.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('teams').delete().neq('id', 0)

  let okTeam = 0
  let okProject = 0
  let err = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const teamId = i + 1
    const { data: teamData, error: teamErr } = await supabase
      .from('teams')
      .insert({
        id: teamId,
        name: row.name,
        track: row.track,
        captain_name: row.captainName,
        team_declaration: row.declaration,
        verify_phone: row.verifyPhone,
      })
      .select('id')
      .single()

    if (teamErr || !teamData) {
      console.error(`[团队插入失败] ${row.name}:`, teamErr?.message)
      err++
      continue
    }
    okTeam++

    const { error: projErr } = await supabase
      .from('projects')
      .insert({
        team_id: teamData.id,
        project_name: row.projectName,
        team_declaration: row.declaration,
        one_liner: row.oneLiner,
        team_intro: row.members,
        links: row.links,
        user_edited: false,
      })

    if (projErr) {
      console.error(`[项目插入失败] ${row.name}:`, projErr.message)
      err++
      continue
    }
    okProject++
  }

  console.log(`完成：团队 ${okTeam} 条，项目 ${okProject} 条，失败 ${err} 条（共 ${rows.length} 条）`)
  if (err > 0) process.exit(1)
}

/* ── Main ─────────────────────────────────────────────── */

async function main() {
  const { startRow, filePath: argPath, execute, force, sheetName } = parseArgs(process.argv.slice(2))
  const xlsxPath = argPath ? path.resolve(argPath) : resolveDefaultXlsx()

  if (!fs.existsSync(xlsxPath)) {
    console.error(`找不到文件: ${xlsxPath}`)
    console.error('请将 xlsx 放在仓库根目录的 project info 文件夹下，或传入绝对路径。')
    process.exit(1)
  }

  const { rows, skipped } = await readRows(xlsxPath, startRow, sheetName)

  if (execute) {
    console.log('Excel:', xlsxPath)
    console.log('工作表:', sheetName)
    console.log('导入条数:', rows.length, skipped ? `（跳过约 ${skipped}）` : '')
    if (force) {
      console.log('模式: 强制全量（清空后重建）')
      await executeRowsForce(rows)
    } else {
      console.log('模式: 增量（保留已编辑/已提交的项目）')
      await executeRowsIncremental(rows)
    }
    return
  }

  printSql(xlsxPath, sheetName, rows, skipped)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
