'use client'

import { useEffect, useState } from 'react'
import { supabase, type Team, type Project } from '@/lib/supabase'
import { filterTeamsForPicker } from '@/lib/teamsPicker'

export default function BravoShowcase() {
  const [teams, setTeams] = useState<Team[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [teamsRes, projectsRes] = await Promise.all([
        supabase.from('teams_public').select('id, name, track, team_declaration').order('id'),
        supabase.from('projects').select('*').eq('is_submitted', true).order('team_id'),
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

  const projectMap = new Map(projects.map(p => [p.team_id, p]))
  const submittedTeams = teams.filter(t => projectMap.has(t.id))

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Aurora gradient overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 95% 0%, rgba(0,206,109,0.16) 0%, rgba(0,131,113,0.08) 30%, transparent 70%), radial-gradient(ellipse 60% 50% at 0% 40%, rgba(0,206,109,0.06) 0%, transparent 60%), radial-gradient(ellipse 70% 60% at 5% 100%, rgba(0,206,109,0.10) 0%, rgba(0,131,113,0.05) 30%, transparent 65%)',
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-8">
            <img
              src="/hackathon-logo-v.png"
              alt="RED HACKATHON"
              className="h-20 w-auto object-contain"
              decoding="async"
            />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            决赛入围项目展示
          </h1>
          <p className="text-green-primary/80 text-sm font-mono">
            {submittedTeams.length} projects submitted
          </p>
        </div>

        {/* Project grid */}
        {submittedTeams.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-dark text-sm">暂无已提交项目</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submittedTeams.map(team => {
              const p = projectMap.get(team.id)!
              return (
                <a
                  key={team.id}
                  href={`/bravo/${team.id}`}
                  className="block px-5 py-4 sm:py-5 rounded-xl border border-gray-dark/15 bg-white/[0.02] hover:border-green-primary/30 hover:bg-green-primary/[0.02] transition-colors group min-w-0"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <span className="text-gray-light/50 font-mono text-xs shrink-0 tabular-nums w-9 text-right">
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
                    <div className="min-w-0 flex-1">
                      <span className="text-white text-sm font-medium block truncate group-hover:text-green-primary transition-colors" title={p.project_name || team.name}>
                        {p.project_name || team.name}
                      </span>
                      {p.one_liner && (
                        <span className="text-gray-light/60 text-xs block truncate mt-0.5">
                          {p.one_liner}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-light/40 text-xs shrink-0 truncate max-w-[8rem]" title={team.name}>
                      {team.name}
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 text-center">
          <div className="h-px bg-gray-dark/10 mb-6" />
          <p className="text-gray-dark/40 text-xs font-mono">/// RED HACKATHON</p>
        </footer>
      </div>
    </div>
  )
}
