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

export default function OnepageV2Page() {
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
  const mediaTier = getScreenshotMediaTier(project, team.name ?? '', team.team_declaration ?? '')
  const oneRowScreenshots = mediaTier >= 2

  return (
    <div className="min-h-screen bg-black flex flex-col items-center py-8 print:py-0">
      {/* Toolbar (hidden in print) */}
      <div className="no-print mb-4 flex items-center gap-3">
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

      {/* A4 Sheet */}
      <div
        className="onepage-root onepage-v2-root relative w-[210mm] min-h-[297mm] bg-black text-gray-light border border-green-primary/40 px-[8mm] py-[5mm] print:px-[5mm] print:py-[3mm] overflow-hidden print:shadow-none print:max-h-[297mm]"
        style={{ maxHeight: '297mm' }}
      >
        {/* Green gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 70% at 95% 0%, rgba(0,206,109,0.18) 0%, rgba(0,131,113,0.10) 30%, transparent 70%), radial-gradient(ellipse 60% 50% at 0% 30%, rgba(0,206,109,0.06) 0%, transparent 60%), radial-gradient(ellipse 70% 60% at 5% 100%, rgba(0,206,109,0.12) 0%, rgba(0,131,113,0.06) 30%, transparent 65%)',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          } as React.CSSProperties}
        />

        {/* Header */}
        <header className="relative z-10 flex items-start justify-between mb-3">
          <div className="flex items-center">
            <img
              src="/hackathon-logo-h.png"
              alt="RED HACKATHON"
              className="h-[42px] w-auto object-contain"
              decoding="async"
            />
          </div>
          <img
            src="/onepage-badge.svg"
            alt="决赛入围项目 ONEPAGE"
            className="h-[52px] w-auto object-contain"
            decoding="async"
          />
        </header>


        {/* Project title + track */}
        <div className="relative z-10 mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white leading-tight line-clamp-2">
            {project.project_name || '未命名项目'}
          </h1>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-medium font-mono border shrink-0 ${
              team.track === '软件赛道'
                ? 'border-green-primary/50 bg-green-primary/10 text-green-primary'
                : 'border-green-bright/50 bg-green-bright/10 text-green-bright'
            }`}
          >
            {team.track}
          </span>
        </div>

        {/* One-liner */}
        {project.one_liner && (
          <div className="relative z-10 border-l-2 border-green-primary pl-3 mb-4">
            <p className="text-base text-green-bright font-medium leading-snug whitespace-pre-line line-clamp-2">
              {project.one_liner}
            </p>
          </div>
        )}

        {/* Section 01: 团队 */}
        <div className="relative z-10 mb-4">
          <SectionLabel label="01" title="团队" />
          <p className="text-[13px] leading-relaxed mb-2.5">
            <span className="text-white font-semibold">{team.name}</span>
            {(project.team_declaration?.trim() || team.team_declaration?.trim()) && (
              <span className="text-gray-light/70">
                {' · '}
                {(project.team_declaration?.trim() || team.team_declaration?.trim())}
              </span>
            )}
          </p>
          {members.length > 0 && members.some(m => m.name?.trim()) && (
            <div className="space-y-2">
              {members
                .filter(m => m.name?.trim())
                .map((member, idx) => (
                  <div
                    key={idx}
                    className="flex items-baseline gap-x-2 text-[11px] leading-relaxed"
                  >
                    <span className="font-semibold text-white shrink-0 w-[4em] text-right">{member.name}</span>
                    <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-green-primary/15 text-green-primary font-mono text-[10px] leading-none whitespace-nowrap">
                      {member.role?.trim() || '—'}
                    </span>
                    {member.bio?.trim() && (
                      <span className="text-gray-light min-w-0 flex-1 line-clamp-1">
                        {member.bio.trim()}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Section 02: 灵感来源 */}
        {project.inspiration && (
          <div className="relative z-10 mb-4">
            <SectionLabel label="02" title="灵感来源" />
            <p className="text-[11px] text-gray-light leading-loose line-clamp-4 whitespace-pre-line">
              {project.inspiration}
            </p>
          </div>
        )}

        {/* Section 03: 解决方案 */}
        {project.solution && (
          <div className="relative z-10 mb-4">
            <SectionLabel label="03" title="解决方案" />
            <p className="text-[11px] text-gray-light leading-loose line-clamp-6 whitespace-pre-line">
              {project.solution}
            </p>
          </div>
        )}

        {/* Section 04: 最惊艳的地方 */}
        {project.highlight && (
          <div className="relative z-10 mb-4">
            <SectionLabel label="04" title="最惊艳的地方" />
            <div className="border border-green-primary/35 bg-green-primary/[0.06] rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-light leading-loose line-clamp-4 whitespace-pre-line">
                {project.highlight}
              </p>
            </div>
          </div>
        )}

        {/* Section 05+06: Screenshots + QR */}
        {hasMedia && (
          <div className="relative z-10 flex gap-3 mt-1 mb-4 pb-1">
            {screenshots.length > 0 && (
              <div className="flex-1 min-w-0">
                <SectionLabel label="05" title="关键效果截图" />
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
                <SectionLabel label="06" title="Demo 二维码" className="whitespace-nowrap" />
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

        {/* Footer */}
        <footer className="relative z-10 mt-auto pt-3">
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
      className={`text-sm font-semibold uppercase tracking-wider mb-2 font-mono flex items-baseline gap-2 ${className}`}
    >
      <span className="text-green-primary text-[10px] opacity-70">[{label}]</span>
      <span className="text-green-bright font-semibold">{title}</span>
    </h3>
  )
}
