'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase, parseScreenshotUrls, type Project, type Team, type TeamMember } from '@/lib/supabase'

export default function ProjectOnePage() {
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !team) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-dark text-lg mb-4">{error}</p>
          <a href="/coconut" className="text-green-primary hover:text-green-bright text-sm">返回总览</a>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-dark">该队伍尚未提交项目信息</p>
      </div>
    )
  }

  const members = (project.team_intro as TeamMember[]) || []
  const links = (project.links as string[]) || []
  const screenshots = parseScreenshotUrls(project.screenshots).slice(0, 4)

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Aurora background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[60%] bg-[#008371] rounded-full blur-[160px] opacity-10" />
        <div className="absolute top-[10%] right-[-20%] w-[50%] h-[50%] bg-[#00f3a8] rounded-full blur-[140px] opacity-8" />
        <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[40%] bg-[#00ce6d] rounded-full blur-[120px] opacity-5" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <svg width="22" height="18" viewBox="0 0 179 150" fill="none" className="shrink-0" aria-hidden>
                <path
                  d="M8 142H72L101 97L121 127L111 142H171L87 8L66 42L82 67L53 113L38 95Z"
                  fill="#d0d0d0"
                  shapeRendering="geometricPrecision"
                />
              </svg>
              <span className="text-gray-dark font-mono text-xs tracking-wider">RED HACKATHON</span>
            </div>
            <a
              href="/coconut"
              className="text-gray-dark hover:text-green-primary text-xs font-mono transition-colors shrink-0"
            >
              ← 返回总览
            </a>
          </div>

          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-mono ${
                team.track === '软件赛道'
                  ? 'bg-green-primary/15 text-green-primary border border-green-primary/20'
                  : 'bg-green-bright/15 text-green-bright border border-green-bright/20'
              }`}>
                {team.track}
              </span>
            </div>
            <span className="text-gray-dark/50 font-mono text-xs">#{String(team.id).padStart(2, '0')}</span>
          </div>

          <h1 className="text-4xl font-bold text-white mb-2">
            {project.project_name || '未命名项目'}
          </h1>
        </header>

        {/* One-liner */}
        {project.one_liner && (
          <section className="mb-10">
            <p className="text-xl text-green-primary font-medium leading-relaxed border-l-2 border-green-primary/40 pl-4">
              {project.one_liner}
            </p>
          </section>
        )}

        {/* Team name */}
        <section className="mb-10">
          <SectionTitle label="01" title="团队名称" />
          <p className="text-gray-light text-sm leading-relaxed">{team.name}</p>
          {team.team_declaration?.trim() && (
            <p className="text-green-primary/90 text-sm leading-relaxed mt-2 whitespace-pre-wrap">
              {team.team_declaration.trim()}
            </p>
          )}
        </section>

        {/* Team */}
        {members.length > 0 && members.some(m => m.name) && (
          <section className="mb-10">
            <SectionTitle label="02" title="团队成员" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {members.filter(m => m.name).map((member, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-gray-dark/15 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-medium text-sm">{member.name}</span>
                    {member.role && (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-primary/10 text-green-primary/80">
                        {member.role}
                      </span>
                    )}
                  </div>
                  {member.bio && (
                    <p className="text-gray-dark text-xs leading-relaxed">{member.bio}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Inspiration */}
        {project.inspiration && (
          <section className="mb-10">
            <SectionTitle label="03" title="灵感来源" subtitle="Why" />
            <p className="text-gray-light text-sm leading-relaxed">{project.inspiration}</p>
          </section>
        )}

        {/* Solution */}
        {project.solution && (
          <section className="mb-10">
            <SectionTitle label="04" title="解决方案" subtitle="How" />
            <p className="text-gray-light text-sm leading-relaxed whitespace-pre-line">{project.solution}</p>
          </section>
        )}

        {/* Highlight */}
        {project.highlight && (
          <section className="mb-10">
            <SectionTitle label="05" title="最惊艳的地方" subtitle="Highlight" />
            <div className="p-5 rounded-xl border border-green-primary/15 bg-green-primary/[0.03]">
              <p className="text-gray-light text-sm leading-relaxed">{project.highlight}</p>
            </div>
          </section>
        )}

        {screenshots.length > 0 && (
          <section className="mb-10">
            <SectionTitle label="06" title="关键效果截图" subtitle="Screenshots" />
            <div className={`grid gap-3 ${screenshots.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {screenshots.map((url, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-gray-dark/15 bg-white/[0.03] flex items-center justify-center p-2 min-h-0"
                >
                  <img
                    src={url}
                    alt={`截图 ${idx + 1}`}
                    className="max-w-full max-h-[min(420px,70vh)] w-auto h-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {project.demo_qr_url?.trim() && (
          <section className="mb-10">
            <SectionTitle label="07" title="Demo 二维码" subtitle="Try it" />
            <div className="flex justify-center">
              <div className="p-4 rounded-xl border border-gray-dark/15 bg-white/[0.02] inline-block">
                <img src={project.demo_qr_url.trim()} alt="Demo QR" className="w-40 h-40 object-contain" />
              </div>
            </div>
          </section>
        )}

        {/* Links */}
        {links.filter(l => l.trim()).length > 0 && (
          <section className="mb-10">
            <SectionTitle label="08" title="项目链接" subtitle="Links" />
            <div className="space-y-2">
              {links.filter(l => l.trim()).map((link, idx) => (
                <a
                  key={idx}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-dark/15 bg-white/[0.02] hover:border-green-primary/30 hover:bg-green-primary/[0.03] transition-colors group"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gray-dark group-hover:text-green-primary transition-colors shrink-0">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  <span className="text-gray-light text-sm truncate group-hover:text-green-primary transition-colors">{link}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* PPT Download */}
        {project.ppt_url && (
          <section className="mb-10">
            <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-dark/15 bg-white/[0.02]">
              <div className="w-10 h-10 rounded-lg bg-green-primary/10 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00ce6d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">队伍 PPT</p>
              </div>
              <a
                href={project.ppt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-xs text-green-primary border border-green-primary/30 rounded-lg hover:bg-green-primary/10 transition-colors"
              >
                下载
              </a>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="pt-8 border-t border-gray-dark/10 text-center">
          <p className="text-gray-dark/40 text-xs font-mono">
            /// RED HACKATHON
          </p>
        </footer>
      </div>
    </div>
  )
}

function SectionTitle({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <span className="text-green-primary font-mono text-xs opacity-60">{label}</span>
      <h2 className="text-white font-medium">{title}</h2>
      {subtitle && <span className="text-gray-dark/40 font-mono text-xs uppercase">{subtitle}</span>}
    </div>
  )
}

