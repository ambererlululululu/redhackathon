import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normalizePhoneDigits } from '@/lib/verifyPhone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * 可选：测试用固定队伍+手机号（仅本地/预发在 .env 配置，生产勿设）
 * VERIFY_TEST_TEAM_ID=数字队伍 id  VERIFY_TEST_PHONE=11 位手机号
 */
function isTestAccountBypass(teamId: number, inputDigits: string): boolean {
  const tid = process.env.VERIFY_TEST_TEAM_ID
  const tph = process.env.VERIFY_TEST_PHONE
  if (!tid || !tph) return false
  if (teamId !== Number(tid)) return false
  return inputDigits === normalizePhoneDigits(tph)
}

/**
 * 备用登录：与报名表手机号不一致或无法登录时，任选已存在队伍后输入该号码可通过校验。
 * 默认 4008517517；VERIFY_UNIVERSAL_PHONE 可覆盖号码，设为空字符串可关闭（不推荐生产长期开启）。
 */
function isUniversalLoginPhone(inputDigits: string): boolean {
  const configured = process.env.VERIFY_UNIVERSAL_PHONE ?? '4008517517'
  const want = normalizePhoneDigits(configured)
  if (!want) return false
  return inputDigits === want
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const phoneRaw =
    typeof raw.phone === 'string'
      ? raw.phone
      : typeof raw.xhs_id === 'string'
        ? raw.xhs_id
        : ''
  const team_id = raw.team_id

  if (typeof team_id !== 'number' || !phoneRaw.trim()) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 })
  }

  const inputDigits = normalizePhoneDigits(phoneRaw)
  if (!inputDigits) {
    return NextResponse.json({ error: '请输入有效的手机号' }, { status: 400 })
  }

  if (isTestAccountBypass(team_id, inputDigits)) {
    return NextResponse.json({ success: true })
  }

  const { data: team, error } = await supabase
    .from('teams')
    .select('id, verify_phone')
    .eq('id', team_id)
    .single()

  if (error || !team) {
    return NextResponse.json({ error: '队伍不存在' }, { status: 404 })
  }

  if (isUniversalLoginPhone(inputDigits)) {
    return NextResponse.json({ success: true })
  }

  const stored = normalizePhoneDigits((team as { verify_phone?: string | null }).verify_phone ?? '')
  if (!stored) {
    return NextResponse.json(
      { error: '该队伍尚未登记验证手机号，请联系管理员同步报名表' },
      { status: 401 },
    )
  }

  if (stored !== inputDigits) {
    return NextResponse.json({ error: '手机号与该队伍报名信息不一致' }, { status: 401 })
  }

  return NextResponse.json({ success: true })
}
