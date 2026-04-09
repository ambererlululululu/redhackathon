'use client'

import { useParams } from 'next/navigation'
import ProjectDetail from '@/components/ProjectDetail'

export default function BravoDetailPage() {
  const params = useParams()
  const teamId = Number(params.teamId)
  return <ProjectDetail teamId={teamId} backUrl="/bravo" backLabel="返回项目展示" />
}
