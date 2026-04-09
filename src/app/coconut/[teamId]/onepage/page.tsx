'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  DEMO_QR_COL_CLASS,
  DEMO_QR_IMG_CLASS,
  getScreenshotMediaTier,
  SCREENSHOT_MAX_H_CLASS,
} from '@/lib/onepageLimits'
import { supabase, parseScreenshotUrls, type Project, type Team, type TeamMember } from '@/lib/supabase'

/**
 * KV：黑底 + 品牌绿（与全站一致，见 globals.css :root）
 * - green-primary  #00ce6d — 主色、描边、按钮
 * - green-bright   #00f3a8 — 高亮字、章节标题、一句话（偏霓虹青绿，非 #00FF9D 等任意色）
 */
export default function OnepagePage() {
  const params = useParams()
  const teamId = Number(params.teamId)

  const [team, setTeam] = useState<Team | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!teamId) return

    async function load() {
      const [teamRes, projectRes] = await Promise.all([
        supabase.from('teams_public').select('id, name, track, team_declaration').eq('id', teamId).single(),
        supabase.from('projects').select('*').eq('team_id', teamId).maybeSingle(),
      ])

      if (teamRes.error || !teamRes.data) {
        setError('队伍不存在')
        setLoading(false)
        return
      }

      setTeam(teamRes.data)

      if (projectRes.error) {
        setError('加载项目信息失败')
        setLoading(false)
        return
      }

      if (projectRes.data) {
        setProject(projectRes.data as Project)
      } else {
        setError('该队伍尚未提交项目信息')
      }

      setLoading(false)
    }

    load()
  }, [teamId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-6 h-6 border-2 border-green-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !team) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-gray-light text-lg mb-4">{error}</p>
          <a href="/coconut" className="text-green-primary hover:text-green-bright text-sm">返回总览</a>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <p className="text-gray-dark">该队伍尚未提交项目信息</p>
      </div>
    )
  }

  const members = (project.team_intro as TeamMember[]) || []
  const screenshots = parseScreenshotUrls(project.screenshots).slice(0, 4)
  const demoQr = project.demo_qr_url?.trim() ?? ''
  const hasMedia = screenshots.length > 0 || demoQr.length > 0
  /** 文本区超过约定行数时略缩小底部截图，为版面腾出空间 */
  const mediaTier = getScreenshotMediaTier(project, team.name ?? '', team.team_declaration ?? '')
  /** 内容较长时，效果图改为单行，避免高度过高导致打印到第二页 */
  const oneRowScreenshots = mediaTier >= 2

  return (
    <div className="min-h-screen bg-black flex flex-col items-center py-8 print:py-0 relative overflow-hidden print:bg-black">
      {/* KV 风格：暗色底 + 轻微绿色光晕（与主站表单一致） */}
      <div
        className="absolute inset-0 pointer-events-none print:hidden"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,243,168,0.08) 0%, rgba(0,131,113,0.04) 40%, transparent 70%), radial-gradient(ellipse 60% 40% at 70% 10%, rgba(0,206,109,0.06) 0%, transparent 60%), linear-gradient(to bottom, rgba(0,167,124,0.03) 0%, transparent 45%)',
        }}
      />

      <div className="no-print mb-4 flex items-center gap-3 relative z-10">
        <a href="/coconut" className="text-gray-dark hover:text-green-primary text-xs transition-colors font-mono">
          ← 返回总览
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-5 py-2 text-sm bg-green-primary text-black font-semibold rounded-lg hover:bg-green-bright transition-colors shadow-lg shadow-green-primary/25"
        >
          打印
        </button>
      </div>

      <div
        className="onepage-root relative z-10 w-[210mm] min-h-[297mm] bg-[#050505] text-gray-light border border-green-primary/25 shadow-[0_0_60px_rgba(0,206,109,0.12)] px-[15mm] py-[12mm] overflow-hidden print:shadow-none print:max-h-[297mm]"
        style={{ maxHeight: '297mm' }}
      >
        <header className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] text-gray-dark font-mono">
                #{String(team.id).padStart(2, '0')}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium font-mono border ${
                  team.track === '软件赛道'
                    ? 'border-green-primary/50 bg-green-primary/10 text-green-primary'
                    : 'border-green-bright/50 bg-green-bright/10 text-green-bright'
                }`}
              >
                {team.track}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white leading-tight mb-0.5">
              {project.project_name || '未命名项目'}
            </h1>
          </div>
          <div className="text-right shrink-0 pl-2 max-w-[40%] flex flex-col items-end justify-start">
            <div className="flex items-center gap-2">
              <svg width="20" height="16" viewBox="0 0 179 150" fill="none" className="shrink-0 opacity-90" aria-hidden>
                <path
                  d="M8 142H72L101 97L121 127L111 142H171L87 8L66 42L82 67L53 113L38 95Z"
                  fill="#b8b8b8"
                  shapeRendering="geometricPrecision"
                />
              </svg>
              <span className="text-gray-dark font-mono text-[10px] tracking-wider">RED HACKATHON</span>
            </div>
          </div>
        </header>

        <div className="h-px bg-green-primary/25 mb-3" />

        {project.one_liner && (
          <div className="border-l-2 border-green-primary pl-3 mb-4">
            <p className="text-sm text-green-bright font-medium leading-snug whitespace-pre-line line-clamp-2">
              {project.one_liner}
            </p>
          </div>
        )}

        {/* 团队名称（移动到团队成员上方） */}
        <div className="mb-3">
          <SectionLabel label="01" title="团队名称" />
          <p className="text-[11px] text-gray-light leading-relaxed">{team.name}</p>
          {team.team_declaration?.trim() && (
            <p className="text-[11px] text-green-bright/90 leading-relaxed mt-1.5 line-clamp-1">
              {team.team_declaration.trim()}
            </p>
          )}
        </div>

        {members.length > 0 && members.some(m => m.name?.trim()) && (
          <div className="mb-3">
            <SectionLabel label="02" title="团队成员" />
            <div className="mt-1.5 space-y-2.5">
              {members
                .filter(m => m.name?.trim())
                .map((member, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] leading-relaxed"
                  >
                    <span className="font-semibold text-white shrink-0">{member.name}</span>

                    <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full bg-green-primary/15 text-green-primary font-mono text-[10px] leading-none">
                      {member.role?.trim() || '团队角色'}
                    </span>

                    {member.bio?.trim() && (
                      <span className="text-gray-light min-w-0 flex-1 basis-[min(100%,18rem)] whitespace-pre-wrap line-clamp-2 print:line-clamp-2">
                        {member.bio.trim()}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {project.inspiration && (
          <div className="mb-3">
            <SectionLabel label="03" title="灵感来源" />
            <p className="text-[11px] text-gray-light leading-relaxed line-clamp-4 whitespace-pre-line">
              {project.inspiration}
            </p>
          </div>
        )}

        {project.solution && (
          <div className="mb-3">
            <SectionLabel label="04" title="解决方案" />
            <p className="text-[11px] text-gray-light leading-relaxed line-clamp-6 whitespace-pre-line">
              {project.solution}
            </p>
          </div>
        )}

        {project.highlight && (
          <div className="mb-3">
            <SectionLabel label="05" title="最惊艳的地方" />
            <div className="border border-green-primary/35 bg-green-primary/[0.06] rounded-lg px-3 py-2">
              <p className="text-[11px] text-gray-light leading-relaxed line-clamp-4 whitespace-pre-line">
                {project.highlight}
              </p>
            </div>
          </div>
        )}

        {hasMedia && (
          <div className="flex gap-3 mt-1 mb-4 pb-1">
            {screenshots.length > 0 && (
              <div className="flex-1 min-w-0">
                <SectionLabel label="06" title="关键效果截图" />
                <div
                  className={`grid gap-2 ${
                    oneRowScreenshots
                      ? screenshots.length === 1
                        ? 'grid-cols-1'
                        : screenshots.length === 2
                          ? 'grid-cols-2'
                          : screenshots.length === 3
                            ? 'grid-cols-3'
                            : 'grid-cols-4'
                      : screenshots.length === 1
                        ? 'grid-cols-1'
                        : 'grid-cols-2'
                  } print:grid-flow-col print:auto-cols-fr print:grid-cols-none`}
                >
                  {screenshots.map((url, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-green-primary/30 bg-black/40 flex items-center justify-center px-1.5 pt-1.5 pb-2.5 min-h-0"
                    >
                      <img
                        src={url}
                        alt={`截图 ${idx + 1}`}
                        className={`max-w-full w-auto h-auto object-contain ${SCREENSHOT_MAX_H_CLASS[mediaTier]}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {demoQr.length > 0 && (
              <div className={`shrink-0 ${DEMO_QR_COL_CLASS[mediaTier]}`}>
                <SectionLabel label="07" title="Demo 二维码" className="whitespace-nowrap" />
                <div className="border border-green-primary/35 rounded-lg px-1.5 pt-1.5 pb-2.5 inline-block bg-white/10">
                  <img
                    src={demoQr}
                    alt="Demo QR"
                    className={`object-contain ${DEMO_QR_IMG_CLASS[mediaTier]}`}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <footer className="mt-auto pt-3">
          <div className="h-px bg-green-primary/20 mb-2" />
          <p className="text-[8px] text-gray-dark font-mono text-center">
            RED HACKATHON
          </p>
        </footer>
      </div>
    </div>
  )
}

function SectionLabel({ label, title, className = '' }: { label: string; title: string; className?: string }) {
  return (
    <h3
      className={`text-sm font-semibold text-green-bright uppercase tracking-wider mb-1.5 font-mono flex items-baseline gap-3 ${className}`}
    >
      <span className="text-green-primary font-mono text-xs opacity-60">{label}</span>
      <span className="text-green-bright font-semibold">{title}</span>
    </h3>
  )
}
