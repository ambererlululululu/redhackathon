'use client'

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react'
import { supabase, parseScreenshotUrls, type Team, type Project, type TeamMember } from '@/lib/supabase'
import {
  CHAR_LIMITS,
  COLS_PER_LINE,
  LINE_LIMITS,
  MAX_TEAM_MEMBERS,
  clampToEffectiveLines,
  effectivePrintLines,
} from '@/lib/onepageLimits'
import WheelPicker from './WheelPicker'
import BrandLogo from './BrandLogo'
import { filterTeamsForPicker } from '@/lib/teamsPicker'

const DEADLINE = new Date('2026-04-10T14:30:00+08:00')

export default function ProjectForm() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [pendingTeamId, setPendingTeamId] = useState<number | null>(null)
  const [verifyPhoneInput, setVerifyPhoneInput] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loadingProject, setLoadingProject] = useState(true)
  const [uploadingPpt, setUploadingPpt] = useState(false)
  const [uploadingScreenshots, setUploadingScreenshots] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState<Omit<Project, 'id' | 'team_id' | 'is_submitted' | 'created_at' | 'updated_at'>>({
    project_name: '',
    team_intro: [{ name: '', role: '', bio: '' }],
    team_declaration: '',
    one_liner: '',
    inspiration: '',
    solution: '',
    highlight: '',
    // 固定 2 个必填槽位：GitHub、小红书；其余可选链接从第 3 个开始
    links: ['', ''],
    ppt_url: '',
    screenshots: [],
    demo_qr_url: '',
  })

  const MAX_LINKS = 5
  const MAX_SCREENSHOTS = 4

  const [now, setNow] = useState<Date | null>(null)
  /** 仅客户端为 true，保证首屏 SSR HTML 与首次 hydrate 一致（避免倒计时等导致 mismatch） */
  const [clientReady, setClientReady] = useState(false)
  const isExpired = now ? now >= DEADLINE : false

  useEffect(() => {
    setClientReady(true)
  }, [])

  // Initialize and update clock on client only (avoid hydration mismatch)
  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const composingRef = useRef(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formRef = useRef(form)
  formRef.current = form
  /** 从 DB 加载的初始表单快照，用于判断用户是否修改过 */
  const initialFormRef = useRef<string>('')

  // Load teams on mount
  useEffect(() => {
    async function loadTeams() {
      const { data } = await supabase.from('teams_public').select('id, name, track, team_declaration').order('id')
      if (data) setTeams(filterTeamsForPicker(data as Team[]))
    }
    loadTeams()
  }, [])

  // Load existing project when team is selected
  useEffect(() => {
    if (!selectedTeamId) return
    const team = teams.find(t => t.id === selectedTeamId) || null
    setSelectedTeam(team)

    async function loadProject() {
      setLoadingProject(true)
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('team_id', selectedTeamId)
        .single()

      if (data) {
        setProjectId(data.id)
        setSubmitted(data.is_submitted)
        setForm({
          project_name: data.project_name || '',
          team_intro: (data.team_intro as TeamMember[]) || [{ name: '', role: '', bio: '' }],
          team_declaration: data.team_declaration || '',
          one_liner: data.one_liner || '',
          inspiration: data.inspiration || '',
          solution: data.solution || '',
          highlight: data.highlight || '',
          links: (() => {
            const raw = (data.links as string[]) ?? []
            const arr = Array.isArray(raw) ? raw : []
            const padded = [...arr]
            while (padded.length < 2) padded.push('')
            return padded
          })(),
          ppt_url: data.ppt_url || '',
          screenshots: parseScreenshotUrls(data.screenshots),
          demo_qr_url: data.demo_qr_url || '',
        })
        setLastSaved(new Date(data.updated_at))
        // 存储初始快照，用于 user_edited 判断
        initialFormRef.current = JSON.stringify({
          project_name: data.project_name || '',
          team_intro: (data.team_intro as TeamMember[]) || [{ name: '', role: '', bio: '' }],
          team_declaration: data.team_declaration || '',
          one_liner: data.one_liner || '',
          inspiration: data.inspiration || '',
          solution: data.solution || '',
          highlight: data.highlight || '',
          links: (() => { const raw = (data.links as string[]) ?? []; const arr = Array.isArray(raw) ? raw : []; const p = [...arr]; while (p.length < 2) p.push(''); return p })(),
          ppt_url: data.ppt_url || '',
          screenshots: parseScreenshotUrls(data.screenshots),
          demo_qr_url: data.demo_qr_url || '',
        })
      } else {
        setProjectId(null)
        setSubmitted(false)
        setForm({
          project_name: '',
          team_intro: [{ name: '', role: '', bio: '' }],
          team_declaration: '',
          one_liner: '',
          inspiration: '',
          solution: '',
          highlight: '',
          links: ['', ''],
          ppt_url: '',
          screenshots: [],
          demo_qr_url: '',
        })
        setLastSaved(null)
        initialFormRef.current = ''
      }
      setLoadingProject(false)
    }
    loadProject()
  }, [selectedTeamId, teams])

  // Auto-save function (returns projectId)
  const savingRef = useRef(false)
  const projectIdRef = useRef<string | null>(null)
  projectIdRef.current = projectId

  const saveProject = useCallback(async (formData?: typeof form): Promise<string | null> => {
    if (!selectedTeamId) return null
    if (savingRef.current) return projectIdRef.current
    savingRef.current = true
    const data = formData || formRef.current
    setSaving(true)

    // 判断表单是否被用户修改过（与初始加载数据对比）
    const currentSnap = JSON.stringify(data)
    const hasUserEdited = initialFormRef.current !== '' && currentSnap !== initialFormRef.current

    const payload = {
      team_id: selectedTeamId,
      ...data,
      ...(hasUserEdited ? { user_edited: true } : {}),
    }

    let currentId = projectIdRef.current

    let saveError = false

    if (currentId) {
      const { error } = await supabase.from('projects').update(payload).eq('id', currentId)
      if (error) {
        console.error('保存失败:', error)
        saveError = true
      }
    } else {
      const { data: result, error } = await supabase
        .from('projects')
        .upsert(payload, { onConflict: 'team_id' })
        .select('id')
        .single()
      if (error) {
        console.error('保存失败:', error)
        saveError = true
      } else if (result) {
        setProjectId(result.id)
        currentId = result.id
      }
    }

    savingRef.current = false
    setSaving(false)
    if (!saveError) {
      setLastSaved(new Date())
    }
    return saveError ? null : currentId
  }, [selectedTeamId])

  // Debounced auto-save on form change
  useEffect(() => {
    if (!selectedTeamId) return

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      saveProject(form)
    }, 2000)

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [form, selectedTeamId, saveProject])

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Team member management
  const MAX_MEMBERS = MAX_TEAM_MEMBERS

  const addMember = () => {
    if (form.team_intro.length >= MAX_MEMBERS) return
    updateField('team_intro', [...form.team_intro, { name: '', role: '', bio: '' }])
  }

  const removeMember = (index: number) => {
    if (form.team_intro.length <= 1) return
    updateField('team_intro', form.team_intro.filter((_, i) => i !== index))
  }

  const updateMember = (index: number, field: keyof TeamMember, value: string) => {
    const updated = [...form.team_intro]
    let v = value
    if (field === 'bio') {
      v = v.replace(/\r?\n/g, '')
      if (v.length > CHAR_LIMITS.member_bio) v = v.slice(0, CHAR_LIMITS.member_bio)
    }
    updated[index] = { ...updated[index], [field]: v }
    updateField('team_intro', updated)
  }

  // File upload with progress
  const uploadFile = async (file: File, folder: string, trackProgress = false): Promise<string | null> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${selectedTeamId}/${folder}/${Date.now()}.${fileExt}`

    if (trackProgress) setUploadProgress(0)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const url = `${supabaseUrl}/storage/v1/object/hackathon-files/${fileName}`

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url)
        xhr.setRequestHeader('Authorization', `Bearer ${supabaseKey}`)
        xhr.setRequestHeader('apikey', supabaseKey)
        xhr.setRequestHeader('x-upsert', 'true')

        if (trackProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100))
            }
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`上传失败: ${xhr.statusText}`))
        }
        xhr.onerror = () => reject(new Error('网络错误'))
        xhr.send(file)
      })
    } catch (err) {
      alert((err as Error).message)
      if (trackProgress) setUploadProgress(0)
      return null
    }

    const { data } = supabase.storage.from('hackathon-files').getPublicUrl(fileName)
    if (trackProgress) setUploadProgress(100)
    return data.publicUrl
  }

  const MAX_PPT_SIZE = 10 * 1024 * 1024 // 10MB
  const MAX_IMAGE_SIZE = 1 * 1024 * 1024 // 1MB

  const handlePptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_PPT_SIZE) {
      alert(`文件大小 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 10MB 限制，请压缩后重新上传`)
      e.target.value = ''
      return
    }
    setUploadingPpt(true)
    const url = await uploadFile(file, 'ppt', true)
    if (url) updateField('ppt_url', url)
    setUploadingPpt(false)
    setUploadProgress(0)
  }

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const remaining = MAX_SCREENSHOTS - form.screenshots.length
    const filesToUpload = Array.from(files).slice(0, remaining)
    if (filesToUpload.length === 0) return
    const oversized = filesToUpload.find(f => f.size > MAX_IMAGE_SIZE)
    if (oversized) {
      alert(`图片 ${oversized.name} 大小 ${(oversized.size / 1024 / 1024).toFixed(1)}MB，超过 1MB 限制，请压缩后重新上传`)
      e.target.value = ''
      return
    }
    setUploadingScreenshots(true)
    const urls: string[] = []
    for (const file of filesToUpload) {
      const url = await uploadFile(file, 'screenshots')
      if (url) urls.push(url)
    }
    updateField('screenshots', [...form.screenshots, ...urls])
    setUploadingScreenshots(false)
  }

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMAGE_SIZE) {
      alert(`图片大小 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 1MB 限制，请压缩后重新上传`)
      e.target.value = ''
      return
    }
    setUploadingQr(true)
    const url = await uploadFile(file, 'qr')
    if (url) updateField('demo_qr_url', url)
    setUploadingQr(false)
  }

  const removeScreenshot = (index: number) => {
    updateField('screenshots', form.screenshots.filter((_, i) => i !== index))
  }

  // Submit
  const submittingRef = useRef(false)
  const handleSubmit = async () => {
    if (!selectedTeamId || submittingRef.current || isExpired) return
    setFormErrors({})

    const scrollToSection = (id: string) => {
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Focus first input/textarea if possible
      const focusable = el.querySelector<HTMLElement>('input, textarea, button, [tabindex]:not([tabindex="-1"])')
      focusable?.focus?.()
    }

    const fail = (id: string, message: string) => {
      setFormErrors(prev => ({ ...prev, [id]: message }))
      scrollToSection(id)
    }

    // Validation — required fields（按表单顺序）
    if (form.team_intro.length > MAX_MEMBERS) {
      fail('sec-team-intro', `团队成员最多 ${MAX_MEMBERS} 人`)
      return
    }
    if (!form.team_intro.some(m => m.name.trim())) { fail('sec-team-intro', '请至少填写一位团队成员的名字'); return }
    for (let i = 0; i < form.team_intro.length; i++) {
      const m = form.team_intro[i]
      if (!m.name.trim()) continue
      const missing = !m.role.trim() ? 'role' : !m.bio.trim() ? 'bio' : null
      if (missing) {
        const label = missing === 'role' ? '角色' : '一句话履历'
        fail('sec-team-intro', `请填写 ${m.name.trim()} 的${label}`)
        const target = document.querySelector<HTMLElement>(`[data-member="${i}"][data-field="${missing}"]`)
        target?.focus()
        return
      }
    }
    if (!form.team_declaration.trim()) { fail('sec-team-declaration', '请填写队伍宣言'); return }
    if (!form.project_name.trim()) { fail('sec-project-name', '请填写项目名称'); return }
    if (!form.one_liner.trim()) { fail('sec-one-liner', '请填写一句话介绍'); return }
    if (!form.inspiration.trim()) { fail('sec-inspiration', '请填写灵感来源'); return }
    if (!form.solution.trim()) { fail('sec-solution', '请填写解决方案'); return }
    if (!form.highlight.trim()) { fail('sec-highlight', '请填写最惊艳的地方'); return }

    // GitHub + 小红书链接为必填（固定前两项）
    const githubLink = (form.links[0] ?? '').trim()
    const xhsLink = (form.links[1] ?? '').trim()
    if (!githubLink) { fail('sec-links', '请填写 GitHub 仓库链接'); return }
    if (!xhsLink) { fail('sec-links', '请填写小红书笔记链接'); return }

    // Team member bio：单行 + 字数（一页纸最多 6 人 × 每人一行）
    for (let i = 0; i < form.team_intro.length; i++) {
      const m = form.team_intro[i]
      const bio = m?.bio ?? ''
      if (bio.includes('\n') || bio.includes('\r')) {
        const who = m?.name?.trim() ? `（${m.name.trim()}）` : ''
        fail('sec-team-intro', `团队成员一句话履历${who}请勿换行`)
        return
      }
      if (effectivePrintLines(bio, COLS_PER_LINE) > LINE_LIMITS.member_bio) {
        const who = m?.name?.trim() ? `（${m.name.trim()}）` : ''
        fail(
          'sec-team-intro',
          `团队成员一句话履历${who}超出允许行数（最多 ${LINE_LIMITS.member_bio} 行）`,
        )
        return
      }
    }

    const textLimitFields: {
      key: 'one_liner' | 'inspiration' | 'solution' | 'highlight'
      label: string
      secId: string
    }[] = [
      { key: 'one_liner', label: '一句话介绍', secId: 'sec-one-liner' },
      { key: 'inspiration', label: '灵感来源', secId: 'sec-inspiration' },
      { key: 'solution', label: '解决方案', secId: 'sec-solution' },
      { key: 'highlight', label: '最惊艳的地方', secId: 'sec-highlight' },
    ]
    for (const { key, label, secId } of textLimitFields) {
      const charLimit = CHAR_LIMITS[key]
      const lineLimit = LINE_LIMITS[key]
      const val = form[key] ?? ''
      const lines = effectivePrintLines(val, COLS_PER_LINE)
      if (lines > lineLimit) {
        fail(secId, `「${label}」行数过多（最多 ${lineLimit} 行）`)
        return
      }
      if (val.length > charLimit) {
        fail(secId, `「${label}」内容过长，请删减`)
        return
      }
    }

    submittingRef.current = true
    setSubmitting(true)
    const savedId = await saveProject(form)

    if (!savedId) {
      fail('sec-submit', '保存失败，请重试')
      setSubmitting(false)
      submittingRef.current = false
      return
    }

    await supabase.from('projects').update({ is_submitted: true }).eq('id', savedId)
    setSubmitted(true)
    setSubmitting(false)
    submittingRef.current = false
  }

  // Verify captain phone（server-side teams.verify_phone；可选 VERIFY_TEST_*；备用号 VERIFY_UNIVERSAL_PHONE 默认 4008517517 任意队伍）
  const handleVerify = async () => {
    if (!pendingTeamId) {
      setVerifyError('请先选择队伍')
      return
    }
    const team = teams.find(t => t.id === pendingTeamId)
    if (!team) return

    const inputId = verifyPhoneInput.trim()
    if (!inputId) {
      setVerifyError('请输入队长手机号')
      return
    }

    setVerifying(true)
    setVerifyError('')

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: pendingTeamId, phone: inputId }),
      })

      if (res.ok) {
        setSelectedTeamId(pendingTeamId)
        setSelectedTeam(team)
      } else {
        const data = await res.json()
        setVerifyError(data.error || '验证失败，请重试')
      }
    } catch {
      setVerifyError('网络错误，请重试')
    }

    setVerifying(false)
  }

  // Team selection view
  if (!selectedTeamId) {
    const pendingTeam = teams.find(t => t.id === pendingTeamId)
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* Aurora background */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,243,168,0.12) 0%, rgba(0,131,113,0.06) 40%, transparent 70%), radial-gradient(ellipse 60% 40% at 70% 10%, rgba(0,206,109,0.08) 0%, transparent 60%), linear-gradient(to bottom, rgba(0,167,124,0.04) 0%, transparent 40%)'
        }} />

        <div className="w-full max-w-md relative z-10">
          {/* 主视觉：中英与图形均在 SVG 路径内，勿再叠 HTML 字以免字体不一致 */}
          <div className="mb-8 flex flex-col items-center text-center">
            <BrandLogo className="max-h-[7.5rem] sm:max-h-28 w-auto max-w-[min(100%,17rem)] mx-auto object-center" />
            {clientReady && now && !isExpired && (
              <div className="mt-4 flex w-full justify-center">
                <DeadlineCountdown now={now} />
              </div>
            )}
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-gray-dark/20 bg-white/[0.02] backdrop-blur-sm p-8 space-y-6">
            {/* Step 1: Team picker */}
            <div className="space-y-2.5">
              <label className="text-xs font-mono text-green-primary tracking-wider uppercase">
                01 / 选择队伍
              </label>
              <WheelPicker
                options={teams.map(t => ({ value: t.id, label: t.name, sub: t.track }))}
                value={pendingTeamId}
                onChange={v => {
                  setPendingTeamId(v)
                  setVerifyError('')
                }}
                placeholder="点击选择你的队伍..."
              />
              {pendingTeam && (
                <div className="flex items-center gap-2 pt-1">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-mono ${
                    pendingTeam.track === '软件赛道'
                      ? 'bg-green-primary/15 text-green-primary border border-green-primary/20'
                      : 'bg-green-bright/15 text-green-bright border border-green-bright/20'
                  }`}>
                    {pendingTeam.track}
                  </span>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-dark/10" />

            {/* Step 2: 手机号验证 */}
            <div className="space-y-2.5">
              <label className="text-xs font-mono text-green-primary tracking-wider uppercase">
                02 / 手机号验证
              </label>
              <input
                type="text"
                value={verifyPhoneInput}
                onChange={e => {
                  setVerifyPhoneInput(e.target.value)
                  setVerifyError('')
                }}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !composingRef.current) handleVerify()
                }}
                placeholder="请输入报名表中的队长手机号"
                inputMode="numeric"
                autoComplete="tel"
                className="w-full px-4 py-3.5 bg-white/[0.03] border border-gray-dark/30 rounded-xl text-white text-sm outline-none transition-all hover:border-green-primary/50 focus:border-green-primary focus:bg-white/[0.05] placeholder:text-gray-dark/60"
              />
            </div>

            {/* Error */}
            {verifyError && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5"/>
                  <path d="M8 5v3.5M8 10.5v.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <p className="text-red-400 text-sm">{verifyError}</p>
              </div>
            )}

            {/* Verify button */}
            <button
              onClick={handleVerify}
              disabled={verifying || !pendingTeamId}
              className="w-full py-3.5 bg-green-primary text-black font-bold rounded-xl hover:bg-green-bright transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-green-primary/20 hover:shadow-green-primary/30"
            >
              {verifying ? '验证中...' : isExpired ? '查看已提交信息 →' : '开始提交项目信息 →'}
            </button>
            {isExpired && (
              <p className="text-center text-red-400/70 text-xs">提交已截止（4 月 10 日 12:00），仅可查看已提交的项目</p>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-gray-dark/40 text-xs mt-8 font-mono">
            /// RED HACKATHON
          </p>
        </div>
      </div>
    )
  }

  // Loading project data (only after team is selected)
  if (selectedTeamId && loadingProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-green-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-dark text-sm">加载中...</p>
        </div>
      </div>
    )
  }

  // Expired + not submitted → deadline passed
  if (isExpired && !submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(96,96,96,0.08) 0%, transparent 60%)'
        }} />
        <div className="text-center max-w-md relative z-10">
          <div className="flex justify-center mb-6">
            <svg width="56" height="48" viewBox="0 0 179 150" fill="none">
              <path d="M8 142H72L101 97L121 127L111 142H171L87 8L66 42L82 67L53 113L38 95Z" fill="#606060" shapeRendering="geometricPrecision"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">提交已截止</h2>
          <p className="text-gray-light mb-2 break-words line-clamp-2">{selectedTeam?.name}</p>
          <p className="text-gray-dark text-sm mb-2">提交截止时间为 4 月 10 日 12:00</p>
          <p className="text-gray-dark/50 text-xs font-mono">/// RED HACKATHON</p>
        </div>
      </div>
    )
  }

  // Success view (submitted, regardless of expired or not)
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* Aurora background */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,243,168,0.12) 0%, rgba(0,131,113,0.06) 40%, transparent 70%)'
        }} />
        <div className="text-center max-w-md relative z-10">
          <div className="flex justify-center mb-6">
            <svg width="56" height="48" viewBox="0 0 179 150" fill="none">
              <path d="M8 142H72L101 97L121 127L111 142H171L87 8L66 42L82 67L53 113L38 95Z" fill="#00ce6d" shapeRendering="geometricPrecision"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">提交成功!</h2>
          <p className="text-gray-light mb-2 break-words line-clamp-2">{selectedTeam?.name} 的项目信息已提交</p>
          {isExpired ? (
            <p className="text-gray-dark text-sm mb-8">提交已截止，信息已锁定</p>
          ) : (
            <>
              <p className="text-gray-dark text-sm mb-2">你仍可以返回修改信息，修改会自动保存</p>
              <p className="text-gray-dark/50 text-xs font-mono mb-8">/// RED HACKATHON</p>
            </>
          )}
          {!isExpired && (
            <button
              onClick={() => setSubmitted(false)}
              className="px-6 py-2.5 border border-green-primary text-green-primary rounded-lg hover:bg-green-primary/10 transition-colors"
            >
              返回编辑
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-sm border-b border-gray-dark/20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <svg width="22" height="18" viewBox="0 0 179 150" fill="none" className="shrink-0">
              <path d="M8 142H72L101 97L121 127L111 142H171L87 8L66 42L82 67L53 113L38 95Z" fill="#d0d0d0" shapeRendering="geometricPrecision"/>
            </svg>
            <span className="text-white font-medium truncate">{selectedTeam?.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              selectedTeam?.track === '软件赛道'
                ? 'bg-green-primary/20 text-green-primary'
                : 'bg-green-bright/20 text-green-bright'
            }`}>
              {selectedTeam?.track}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {saving ? (
              <span className="text-green-primary animate-pulse-green flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-primary"></span>
                保存中...
              </span>
            ) : (
              <>
                <button
                  onClick={() => saveProject(form)}
                  className="px-3 py-1 text-green-primary border border-green-primary/30 rounded-md hover:bg-green-primary/10 transition-colors"
                >
                  保存
                </button>
                {lastSaved && (
                  <span className="text-gray-dark flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-dark"></span>
                    已保存 {lastSaved.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">项目信息提交</h1>
          <p className="text-gray-dark text-sm font-mono">/// RED HACKATHON</p>
        </div>

        {/* 团队成员 */}
        <Section
          id="sec-team-intro"
          title="团队成员"
          desc={`最多${MAX_MEMBERS}人`}
          required
          error={formErrors['sec-team-intro']}
        >
          <div className="space-y-3">
            {form.team_intro.map((member, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.5fr)] gap-2">
                  <input
                    type="text"
                    value={member.name}
                    onChange={e => updateMember(idx, 'name', e.target.value)}
                    placeholder="名字"
                    className="input-field min-w-0"
                  />
                  <input
                    type="text"
                    value={member.role}
                    onChange={e => updateMember(idx, 'role', e.target.value)}
                    placeholder="角色"
                    data-member={idx}
                    data-field="role"
                    className="input-field min-w-0"
                  />
                  <input
                    type="text"
                    value={member.bio}
                    onChange={e => updateMember(idx, 'bio', e.target.value)}
                    placeholder="单行履历，勿换行"
                    maxLength={CHAR_LIMITS.member_bio}
                    data-member={idx}
                    data-field="bio"
                    className="input-field min-w-0"
                  />
                </div>
                {form.team_intro.length > 1 && (
                  <button
                    onClick={() => removeMember(idx)}
                    className="mt-2 text-gray-dark hover:text-red-400 transition-colors text-lg leading-none"
                    title="移除成员"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
          {form.team_intro.length < MAX_MEMBERS ? (
            <button
              onClick={addMember}
              className="mt-3 text-sm text-green-primary hover:text-green-bright transition-colors flex items-center gap-1"
            >
              <span>+</span> 添加成员
            </button>
          ) : (
            <p className="mt-2 text-gray-dark text-xs">已达上限 {MAX_MEMBERS} 人</p>
          )}
        </Section>

        {/* 队伍宣言 */}
        <Section id="sec-team-declaration" title="队伍宣言" required error={formErrors['sec-team-declaration']}>
          <input
            type="text"
            value={form.team_declaration}
            onChange={e => {
              const v = e.target.value
              if (v.length <= 100) updateField('team_declaration', v)
            }}
            placeholder="用一句话介绍你的队伍"
            maxLength={100}
            className="input-field"
          />
          <p className="text-right text-gray-dark/50 text-xs mt-1 font-mono">{form.team_declaration.length} / 100 字</p>
        </Section>

        {/* 项目名称 */}
        <Section id="sec-project-name" title="项目名称" required error={formErrors['sec-project-name']}>
          <input
            type="text"
            value={form.project_name}
            onChange={e => updateField('project_name', e.target.value)}
            placeholder="输入你的项目名称"
            className="input-field"
          />
        </Section>

        {/* 一句话介绍 */}
        <Section id="sec-one-liner" title="一句话介绍" required error={formErrors['sec-one-liner']}>
          <TextAreaWithLimit
            value={form.one_liner}
            onChange={v => updateField('one_liner', v)}
            maxLines={LINE_LIMITS.one_liner}
            maxLength={CHAR_LIMITS.one_liner}
            placeholder="用一句话描述你的项目"
            rows={2}
          />
        </Section>

        {/* 灵感来源 */}
        <Section id="sec-inspiration" title="灵感来源" required error={formErrors['sec-inspiration']}>
          <TextAreaWithLimit
            value={form.inspiration}
            onChange={v => updateField('inspiration', v)}
            maxLines={LINE_LIMITS.inspiration}
            maxLength={CHAR_LIMITS.inspiration}
            placeholder="是什么启发了你做这个项目？"
            rows={4}
          />
        </Section>

        {/* 解决方案 */}
        <Section id="sec-solution" title="解决方案" required error={formErrors['sec-solution']}>
          <TextAreaWithLimit
            value={form.solution}
            onChange={v => updateField('solution', v)}
            maxLines={LINE_LIMITS.solution}
            maxLength={CHAR_LIMITS.solution}
            placeholder="How？描述产品核心逻辑与技术方案，并举 1-2 个最典型的用户使用场景"
            rows={5}
          />
        </Section>

        {/* 最惊艳的地方 */}
        <Section id="sec-highlight" title="最惊艳的地方" required error={formErrors['sec-highlight']}>
          <TextAreaWithLimit
            value={form.highlight}
            onChange={v => updateField('highlight', v)}
            maxLines={LINE_LIMITS.highlight}
            maxLength={CHAR_LIMITS.highlight}
            placeholder="你的项目最让人眼前一亮的地方是什么？"
            rows={4}
          />
        </Section>

        {/* 项目链接 */}
        <Section
          id="sec-links"
          title="项目链接 & 网址"
          desc="GitHub 仓库链接 + 小红书笔记链接为必填；如有 Demo 在线地址/原型/文档，可在下方继续添加"
          required
          error={formErrors['sec-links']}
        >
          <div className="space-y-3">
            {form.links.map((link, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  type="url"
                  value={link}
                  onChange={e => {
                    const updated = [...form.links]
                    updated[idx] = e.target.value
                    updateField('links', updated)
                  }}
                  placeholder={
                    idx === 0
                      ? 'GitHub 仓库链接（确认带 #Redhackathon 标签）'
                      : idx === 1
                        ? '小红书笔记链接（图文/视频均可，确认已带 #黑客松巅峰赛 标签）'
                        : `链接 ${idx + 1}（Demo/文档/原型等）`
                  }
                  className="input-field flex-1"
                />
                {idx >= 2 && form.links.length > 2 && (
                  <button
                    onClick={() => updateField('links', form.links.filter((_, i) => i !== idx))}
                    className="text-gray-dark hover:text-red-400 transition-colors text-lg leading-none px-1"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-gray-dark/70 text-xs leading-relaxed space-y-1">
            <p>建议包含：</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>GitHub 仓库链接（仓库 Readme/Topics 里带上 <span className="text-gray-light/80">#Redhackathon</span>）</li>
              <li>小红书笔记链接（图文/视频均可，发布时带 <span className="text-gray-light/80">#黑客松巅峰赛</span>）</li>
            </ul>
          </div>
          {form.links.length < MAX_LINKS ? (
            <button
              onClick={() => updateField('links', [...form.links, ''])}
              className="mt-3 text-sm text-green-primary hover:text-green-bright transition-colors flex items-center gap-1"
            >
              <span>+</span> 添加链接
            </button>
          ) : (
            <p className="mt-2 text-gray-dark text-xs">已达上限 {MAX_LINKS} 个链接</p>
          )}
        </Section>

        {/* PPT 上传 */}
        <Section title="项目 PPT/PDF">
          {form.ppt_url ? (
            <div className="flex items-center gap-3 p-4 rounded-lg border border-gray-dark/30 bg-white/[0.02]">
              <div className="w-10 h-10 rounded-lg bg-green-primary/10 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00ce6d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm">文件已上传</p>
              </div>
              <a
                href={`https://docs.google.com/gview?url=${encodeURIComponent(form.ppt_url)}&embedded=false`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs text-green-primary border border-green-primary/30 rounded-lg hover:bg-green-primary/10 transition-colors"
              >
                预览
              </a>
              <a
                href={form.ppt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs text-green-bright border border-green-bright/30 rounded-lg hover:bg-green-bright/10 transition-colors"
              >
                下载
              </a>
              <button
                onClick={() => updateField('ppt_url', '')}
                className="text-gray-dark hover:text-red-400 transition-colors text-lg leading-none"
              >
                &times;
              </button>
            </div>
          ) : (
            <label className="upload-zone block p-6 rounded-lg border border-dashed border-gray-dark/50 text-center cursor-pointer">
              <input
                type="file"
                accept=".ppt,.pptx,.pdf,.key"
                onChange={handlePptUpload}
                className="hidden"
                disabled={uploadingPpt}
              />
              {uploadingPpt ? (
                <div className="space-y-3">
                  <span className="text-green-primary text-sm">上传中 {uploadProgress}%</span>
                  <div className="w-full max-w-xs mx-auto h-1.5 bg-gray-dark/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-primary rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-gray-light text-sm">点击上传文件</span>
                  <p className="text-gray-dark/50 text-xs">支持 PPT、PPTX、PDF、Keynote，不超过 10MB</p>
                </div>
              )}
            </label>
          )}
        </Section>

        {/* 截图上传 */}
        <Section title="关键效果截图/展示照片">
          {form.screenshots.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              {form.screenshots.map((url, idx) => (
                <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-dark/30">
                  <img src={url} alt={`截图 ${idx + 1}`} className="w-full h-32 object-cover" />
                  <button
                    onClick={() => removeScreenshot(idx)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          {form.screenshots.length < MAX_SCREENSHOTS ? (
            <label className="upload-zone block p-6 rounded-lg border border-dashed border-gray-dark/50 text-center cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleScreenshotUpload}
                className="hidden"
                disabled={uploadingScreenshots}
              />
              {uploadingScreenshots ? (
                <span className="text-green-primary animate-pulse-green">上传中...</span>
              ) : (
                <>
                  <span className="text-gray-dark">点击上传截图（最多 {MAX_SCREENSHOTS} 张，已上传 {form.screenshots.length} 张）</span>
                  <span className="text-gray-dark/50 text-xs">单张不超过 1MB</span>
                </>
              )}
            </label>
          ) : (
            <p className="text-gray-dark text-xs">已达上限 {MAX_SCREENSHOTS} 张截图</p>
          )}
        </Section>

        {/* Demo 二维码 */}
        <Section title="Demo 二维码">
          {form.demo_qr_url ? (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-dark/30 bg-gray-dark/5">
              <img src={form.demo_qr_url} alt="QR" className="w-16 h-16 object-contain rounded" />
              <span className="text-green-primary text-sm">二维码已上传</span>
              <button
                onClick={() => updateField('demo_qr_url', '')}
                className="ml-auto text-gray-dark hover:text-red-400 text-sm"
              >
                删除
              </button>
            </div>
          ) : (
            <label className="upload-zone block p-6 rounded-lg border border-dashed border-gray-dark/50 text-center cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleQrUpload}
                className="hidden"
                disabled={uploadingQr}
              />
              {uploadingQr ? (
                <span className="text-green-primary animate-pulse-green">上传中...</span>
              ) : (
                <span className="text-gray-dark">点击上传二维码</span>
              )}
            </label>
          )}
          <p className="mt-2 text-gray-dark/60 text-xs leading-relaxed">
            友情提示：若 Demo 有可在线访问的链接，可在微信内搜索「草料二维码」小程序，将链接生成二维码图片后保存，再上传至上方。
          </p>
        </Section>
      </main>

      {/* Submit bar */}
      <div id="sec-submit" className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-sm border-t border-gray-dark/20 py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between gap-3">
          <p className="text-gray-dark text-xs flex-1 min-w-0">
            表单会自动保存草稿，关闭页面后可重新选择队伍继续编辑
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="shrink-0 whitespace-nowrap px-6 sm:px-8 py-2.5 bg-green-primary text-black font-bold rounded-lg hover:bg-green-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '提交中...' : '提交项目'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Section wrapper
function Section({ id, title, desc, required, error, children }: {
  id?: string
  title: string
  desc?: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="space-y-3 scroll-mt-24">
      <div>
        <h3 className="text-white font-medium flex items-center gap-1">
          {title}
          {required && <span className="text-green-primary text-sm">*</span>}
        </h3>
        {desc && <p className="text-gray-dark text-xs mt-0.5">{desc}</p>}
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
      {children}
    </section>
  )
}

// TextArea：与一页纸 preview 相同的行数/字数约束，右下角展示计数
function TextAreaWithLimit({
  value,
  onChange,
  maxLength,
  maxLines,
  placeholder,
  rows,
}: {
  value: string
  onChange: (v: string) => void
  maxLength: number
  maxLines: number
  placeholder: string
  rows: number
}) {
  const lineCount = effectivePrintLines(value, COLS_PER_LINE)
  const isOverChars = value.length > maxLength
  const isOverLines = lineCount > maxLines

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    let v = e.target.value
    v = clampToEffectiveLines(v, maxLines, COLS_PER_LINE)
    if (v.length > maxLength) v = v.slice(0, maxLength)
    v = clampToEffectiveLines(v, maxLines, COLS_PER_LINE)
    onChange(v)
  }

  const over = isOverChars || isOverLines

  return (
    <div>
      <textarea
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={`input-field resize-none ${over ? 'ring-1 ring-red-400/50' : ''}`}
        style={{ minHeight: `${rows * 1.5}rem` }}
      />
      <div
        className={`text-xs mt-1.5 text-right flex flex-wrap justify-end gap-x-3 gap-y-0.5 font-mono ${over ? 'text-red-400' : 'text-gray-dark'}`}
      >
        <span title="按版心宽度估算的有效行数（含自动换行）">
          {lineCount} / {maxLines} 行
        </span>
        <span>
          {value.length} / {maxLength} 字
        </span>
      </div>
    </div>
  )
}

// Deadline countdown
function DeadlineCountdown({ now }: { now: Date }) {
  const diff = DEADLINE.getTime() - now.getTime()
  if (diff <= 0) return null

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  return (
    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-dark/20 bg-white/[0.02]">
      <span className="w-1.5 h-1.5 rounded-full bg-green-primary animate-pulse-green" />
      <span className="text-gray-dark text-xs">提交截止倒计时</span>
      <span className="text-white font-mono text-xs">
        {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  )
}
