'use client'

import { useEffect, useState } from 'react'
import { supabase, type Team, type Project } from '@/lib/supabase'
import { filterTeamsForPicker } from '@/lib/teamsPicker'

export default function ReviewList() {
  const [teams, setTeams] = useState<Team[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      const [teamsRes, projectsRes] = await Promise.all([
        supabase.from('teams_public').select('id, name, track, team_declaration').order('id'),
        supabase.from('projects').select('*').order('team_id'),
      ])
      if (teamsRes.data) setTeams(filterTeamsForPicker(teamsRes.data as Team[]))
      if (projectsRes.data) setProjects(projectsRes.data as Project[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  function nonEmptyStringCount(v: unknown): number {
    if (Array.isArray(v)) {
      return v
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((s) => s.length > 0).length
    }
    if (typeof v === 'string') {
      const t = v.trim()
      if (!t) return 0
      if (t.startsWith('[')) {
        try {
          const parsed = JSON.parse(t) as unknown
          return nonEmptyStringCount(parsed)
        } catch {
          return 0
        }
      }
      // treat a single url-like string as 1 entry
      return 1
    }
    return 0
  }

  function isProjectBlank(p: Project): boolean {
    const anyText =
      Boolean(String((p as any).project_name ?? '').trim()) ||
      Boolean(String((p as any).one_liner ?? '').trim()) ||
      Boolean(String((p as any).inspiration ?? '').trim()) ||
      Boolean(String((p as any).solution ?? '').trim()) ||
      Boolean(String((p as any).highlight ?? '').trim()) ||
      Boolean(String((p as any).ppt_url ?? '').trim()) ||
      Boolean(String((p as any).demo_qr_url ?? '').trim())

    if (anyText) return false

    // team_intro: 默认会有 1 个空成员占位，不应被视作“草稿”
    const teamIntro = (p as any).team_intro
    const members = Array.isArray(teamIntro)
      ? teamIntro
      : (typeof teamIntro === 'string' && teamIntro.trim().startsWith('[')
          ? (() => {
              try { return JSON.parse(teamIntro) } catch { return [] }
            })()
          : [])
    const hasRealMember = Array.isArray(members) && members.some((m) => {
      if (!m || typeof m !== 'object') return false
      const name = String((m as any).name ?? '').trim()
      const role = String((m as any).role ?? '').trim()
      const bio = String((m as any).bio ?? '').trim()
      return Boolean(name || role || bio)
    })

    const linksLen = nonEmptyStringCount((p as any).links)
    const screenshotsLen = nonEmptyStringCount((p as any).screenshots)
    if (hasRealMember || linksLen > 0 || screenshotsLen > 0) return false

    // 如果是页面自动保存/占位 insert（created_at 和 updated_at 往往非常接近），也应算「未填写」而不是「草稿」
    const created = String((p as any).created_at ?? '')
    const updated = String((p as any).updated_at ?? '')
    if (created && updated) {
      const c = Date.parse(created)
      const u = Date.parse(updated)
      if (Number.isFinite(c) && Number.isFinite(u)) {
        if (Math.abs(u - c) <= 15_000) return true
      } else if (created === updated) {
        return true
      }
    }

    // 无时间字段时：仅凭“全空”判为未填写
    return true
  }

  const projectMap = new Map(projects.map(p => [p.team_id, p]))
  const submitted = teams.filter(t => projectMap.get(t.id)?.is_submitted)
  const drafts = teams.filter(t => {
    const p = projectMap.get(t.id)
    return p && !p.is_submitted && !isProjectBlank(p)
  })
  const empty = teams.filter(t => {
    const p = projectMap.get(t.id)
    return !p || (p && !p.is_submitted && isProjectBlank(p))
  })

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <svg width="22" height="18" viewBox="0 0 179 150" fill="none" className="shrink-0" aria-hidden>
              <path
                d="M8 142H72L101 97L121 127L111 142H171L87 8L66 42L82 67L53 113L38 95Z"
                fill="#d0d0d0"
                shapeRendering="geometricPrecision"
              />
            </svg>
            <h1 className="text-2xl font-bold text-white truncate">项目信息总览</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setExporting(true)
              window.location.href = '/api/export-submitted'
              // best-effort reset; actual download handled by browser
              setTimeout(() => setExporting(false), 1200)
            }}
            disabled={exporting || submitted.length === 0}
            className="shrink-0 whitespace-nowrap px-4 py-2 text-xs rounded-lg border border-green-primary/30 text-green-primary hover:bg-green-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={submitted.length === 0 ? '暂无已提交项目可导出' : '下载已提交项目（xlsx）'}
          >
            {exporting ? '准备下载…' : '下载已提交（xlsx）'}
          </button>
        </div>
        <p className="text-gray-light/65 text-sm font-mono mb-8">/// STAFF ONLY &gt;&gt; RED HACKATHON</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <StatCard label="已提交" count={submitted.length} color="green-primary" />
          <StatCard label="草稿中" count={drafts.length} color="yellow-500" />
          <StatCard label="未填写" count={empty.length} color="gray-dark" />
        </div>

        {/* Submitted */}
        {submitted.length > 0 && (
          <div className="mb-10">
            <h2 className="text-white font-medium mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-primary" />
              已提交（{submitted.length}）
            </h2>
            <div className="space-y-2">
              {submitted.map(team => {
                const p = projectMap.get(team.id)!
                return (
                  <div
                    key={team.id}
                    className="flex items-center gap-3 sm:gap-4 px-5 py-3 sm:py-4 rounded-xl border border-gray-dark/15 bg-white/[0.02] min-w-0"
                  >
                    <span className="text-gray-light/55 font-mono text-xs shrink-0 tabular-nums w-9 sm:w-10 text-right">
                      #{String(team.id).padStart(2, '0')}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 max-w-[5.5rem] truncate ${
                        team.track === '软件赛道'
                          ? 'bg-green-primary/15 text-green-primary'
                          : 'bg-green-bright/15 text-green-bright'
                      }`}
                      title={team.track}
                    >
                      {team.track}
                    </span>
                    <span className="text-white text-sm font-medium min-w-0 flex-1 basis-0 truncate" title={team.name}>
                      {team.name}
                    </span>
                    <span
                      className="text-gray-light/80 text-xs min-w-0 flex-1 basis-0 truncate"
                      title={p.project_name || undefined}
                    >
                      {p.project_name || '—'}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`/coconut/${team.id}/onepage`}
                        className="px-3 py-1.5 text-xs rounded-lg border border-green-primary/30 text-green-primary hover:bg-green-primary/10 transition-colors"
                      >
                        评审onepage
                      </a>
                      <a
                        href={`/coconut/${team.id}`}
                        className="px-3 py-1.5 text-xs rounded-lg border border-green-primary/30 text-green-primary hover:bg-green-primary/10 transition-colors"
                      >
                        项目详情
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Drafts */}
        {drafts.length > 0 && (
          <div className="mb-10">
            <h2 className="text-white font-medium mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              草稿中（{drafts.length}）
            </h2>
            <div className="space-y-2">
              {drafts.map(team => {
                const p = projectMap.get(team.id)!
                return (
                  <a
                    key={team.id}
                    href={`/coconut/${team.id}`}
                    className="flex items-center gap-3 sm:gap-4 px-5 py-3 sm:py-4 rounded-xl border border-gray-dark/15 bg-white/[0.02] hover:border-yellow-500/30 transition-colors group min-w-0"
                  >
                    <span className="text-gray-light/55 font-mono text-xs shrink-0 tabular-nums w-9 sm:w-10 text-right">
                      #{String(team.id).padStart(2, '0')}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 max-w-[5.5rem] truncate ${
                        team.track === '软件赛道'
                          ? 'bg-green-primary/15 text-green-primary'
                          : 'bg-green-bright/15 text-green-bright'
                      }`}
                      title={team.track}
                    >
                      {team.track}
                    </span>
                    <span className="text-white text-sm min-w-0 flex-1 basis-0 truncate" title={team.name}>
                      {team.name}
                    </span>
                    <span
                      className="text-gray-light/80 text-xs min-w-0 flex-1 basis-0 truncate"
                      title={p.project_name || undefined}
                    >
                      {p.project_name || '—'}
                    </span>
                    <span className="text-yellow-400 text-xs shrink-0">草稿</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty */}
        {empty.length > 0 && (
          <div>
            <h2 className="text-white font-medium mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-light/40" />
              未填写（{empty.length}）
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {empty.map(team => (
                <div
                  key={team.id}
                  className="px-4 py-3 rounded-lg border border-gray-dark/20 bg-white/[0.03] min-w-0 flex items-baseline gap-2"
                >
                  <span className="text-gray-light/50 text-xs font-mono shrink-0">#{String(team.id).padStart(2, '0')}</span>
                  <span className="text-gray-light/75 text-sm truncate min-w-0" title={team.name}>
                    {team.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="p-4 rounded-xl border border-gray-dark/15 bg-white/[0.02] text-center">
      <div className={`text-3xl font-bold text-${color} mb-1`}>{count}</div>
      <div className="text-gray-light/75 text-xs">{label}</div>
    </div>
  )
}
