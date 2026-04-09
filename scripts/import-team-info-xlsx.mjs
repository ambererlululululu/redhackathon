#!/usr/bin/env node
/**
 * 从 Excel 读取队伍信息，生成 SQL 或直接写入 Supabase。
 *
 * 仅使用工作表：「to曹杰-PPT制作表」（可用 --sheet= 覆盖）。
 * 写入字段仅来自：B=团队名称，D=赛道（软件→软件赛道；硬件→硬件赛道），G=队伍宣言，H=队长手机号。
 * 其他列不读、不写。项目名称由选手在站内表单填写，不由本脚本导入。
 *
 * 用法：
 *   node scripts/import-team-info-xlsx.mjs
 *   node --env-file=.env.local scripts/import-team-info-xlsx.mjs --execute
 *   node scripts/import-team-info-xlsx.mjs --sheet=其他表名 /path/to/file.xlsx
 */

import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_FILENAME = '黑巅2026-决赛队伍信息.xlsx'
/** 与组委会提供的制作表一致；仅此 sheet 参与导入 */
const DEFAULT_SHEET_NAME = 'to曹杰-PPT制作表'

function parseArgs(argv) {
  let startRow = 2
  let filePath = null
  let execute = false
  let sheetName = DEFAULT_SHEET_NAME
  for (const a of argv) {
    if (a === '--execute') {
      execute = true
      continue
    }
    if (a.startsWith('--start-row=')) {
      startRow = Math.max(1, parseInt(a.split('=')[1], 10) || 2)
      continue
    }
    if (a.startsWith('--sheet=')) {
      sheetName = a.slice('--sheet='.length).trim() || DEFAULT_SHEET_NAME
      continue
    }
    if (!a.startsWith('-')) {
      filePath = a
    }
  }
  return { startRow, filePath, execute, sheetName }
}

function resolveDefaultXlsx() {
  const roots = [process.cwd(), path.join(process.cwd(), '..'), path.join(__dirname, '..', '..')]
  for (const root of roots) {
    const p = path.join(root, 'project info', DEFAULT_FILENAME)
    if (fs.existsSync(p)) return p
  }
  return path.join(process.cwd(), 'project info', DEFAULT_FILENAME)
}

function mapTrack(raw) {
  const v = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
  if (!v) return null
  if (v === '软件' || v === '软件赛道' || v.includes('软件')) return '软件赛道'
  if (v === '硬件' || v === '硬件赛道' || v.includes('硬件')) return '硬件赛道'
  return null
}

function sqlString(s) {
  return "'" + String(s ?? '').replace(/'/g, "''") + "'"
}

function normalizeCellText(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 与前端验证一致：只存数字 */
function normalizePhoneForStorage(raw) {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(Math.round(raw))
  }
  return String(raw).replace(/\D/g, '')
}

function getWorksheet(workbook, sheetName) {
  const sheet = workbook.getWorksheet(sheetName)
  if (sheet) return sheet
  const names = workbook.worksheets.map((w) => w.name).join(', ')
  throw new Error(
    `找不到工作表「${sheetName}」。当前工作簿中的表：${names || '（无）'}`,
  )
}

async function readTeamRows(xlsxPath, startRow, sheetName) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(xlsxPath)
  const sheet = getWorksheet(workbook, sheetName)

  const COL_B = 2
  const COL_D = 4
  const COL_G = 7
  const COL_H = 8

  const rows = []
  let skipped = 0

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return
    const nameCell = row.getCell(COL_B)
    const name = normalizeCellText(nameCell.text ?? nameCell.value ?? '')
    if (!name) {
      skipped++
      return
    }

    const dCell = row.getCell(COL_D)
    const trackRaw = dCell.text ?? dCell.value
    const track = mapTrack(trackRaw)
    if (!track) {
      console.warn(`[跳过 第 ${rowNumber} 行] 团队「${name}」赛道无法识别: ${JSON.stringify(trackRaw)}`)
      skipped++
      return
    }

    const gCell = row.getCell(COL_G)
    const declaration = normalizeCellText(gCell.text ?? gCell.value ?? '')

    const hCell = row.getCell(COL_H)
    const verifyPhone = normalizePhoneForStorage(hCell.text ?? hCell.value ?? '')
    if (!verifyPhone) {
      console.warn(`[提示 第 ${rowNumber} 行] 团队「${name}」H 列手机号为 empty，验证将无法通过，请补全 Excel 后重新导入`)
    }

    rows.push({ name, track, declaration, verifyPhone, rowNumber })
  })

  return { rows, skipped }
}

function printSql(xlsxPath, sheetName, rows, skipped) {
  console.log('-- 自 Excel 导入：', xlsxPath)
  console.log('-- 工作表:', sheetName)
  console.log('-- 数据行数:', rows.length, skipped ? `（跳过/空行约 ${skipped}）` : '')
  console.log('BEGIN;')
  console.log('')

  for (const { name, track, declaration, verifyPhone } of rows) {
    const qName = sqlString(name)
    const qTrack = sqlString(track)
    const qDecl = sqlString(declaration)
    const qPhone = sqlString(verifyPhone)
    console.log(
      `INSERT INTO teams (name, track, team_declaration, verify_phone)\n` +
        `VALUES (${qName}, ${qTrack}, ${qDecl}, ${qPhone})\n` +
        `ON CONFLICT (name) DO UPDATE SET\n` +
        `  track = EXCLUDED.track,\n` +
        `  team_declaration = EXCLUDED.team_declaration,\n` +
        `  verify_phone = EXCLUDED.verify_phone;`,
    )
    console.log('')
  }

  console.log('COMMIT;')
}

/**
 * 写入 Supabase：teams（团队名称/赛道/宣言/手机）
 */
async function executeRows(rows) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('缺少环境变量：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY')
    console.error('示例：node --env-file=.env.local scripts/import-team-info-xlsx.mjs --execute')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let ok = 0
  let err = 0
  let skippedVerifyPhone = false

  const missingVerifyPhoneColumn = (e) =>
    e && String(e.message).includes('verify_phone') && String(e.message).includes('schema')

  for (const row of rows) {
    const { name, track, declaration, verifyPhone } = row
    const { data: existing, error: selErr } = await supabase
      .from('teams')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (selErr) {
      console.error(`[查询失败] ${name}:`, selErr.message)
      err++
      continue
    }

    if (existing) {
      let upErr = (
        await supabase
          .from('teams')
          .update({ track, team_declaration: declaration, verify_phone: verifyPhone })
          .eq('id', existing.id)
      ).error
      if (missingVerifyPhoneColumn(upErr)) {
        skippedVerifyPhone = true
        upErr = (
          await supabase.from('teams').update({ track, team_declaration: declaration }).eq('id', existing.id)
        ).error
      }
      if (upErr) {
        console.error(`[更新失败] ${name}:`, upErr.message)
        err++
        continue
      }
      ok++
    } else {
      let ins = await supabase
        .from('teams')
        .insert({
          name,
          track,
          team_declaration: declaration,
          verify_phone: verifyPhone,
        })
        .select('id')
        .single()
      if (missingVerifyPhoneColumn(ins.error)) {
        skippedVerifyPhone = true
        ins = await supabase
          .from('teams')
          .insert({
            name,
            track,
            team_declaration: declaration,
          })
          .select('id')
          .single()
      }
      if (ins.error || !ins.data) {
        console.error(`[插入失败] ${name}:`, ins.error?.message)
        err++
        continue
      }
      ok++
    }
  }

  if (skippedVerifyPhone) {
    console.warn(
      '提示：数据库尚无 verify_phone 列，本次仅同步了赛道与宣言；请在 Supabase 执行 migrations/20260410_teams_verify_phone.sql 后再导入以写入手机号。',
    )
  }

  console.log(`完成：成功 ${ok} 条，失败 ${err} 条（共 ${rows.length} 条）`)
  if (err > 0) process.exit(1)
}

async function main() {
  const { startRow, filePath: argPath, execute, sheetName } = parseArgs(process.argv.slice(2))
  const xlsxPath = argPath ? path.resolve(argPath) : resolveDefaultXlsx()

  if (!fs.existsSync(xlsxPath)) {
    console.error(`找不到文件: ${xlsxPath}`)
    console.error('请将 xlsx 放在仓库根目录的 project info 文件夹下，或传入绝对路径。')
    process.exit(1)
  }

  const { rows, skipped } = await readTeamRows(xlsxPath, startRow, sheetName)

  if (execute) {
    console.log('Excel:', xlsxPath)
    console.log('工作表:', sheetName)
    console.log('导入条数:', rows.length, skipped ? `（跳过约 ${skipped}）` : '')
    await executeRows(rows)
    return
  }

  printSql(xlsxPath, sheetName, rows, skipped)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
