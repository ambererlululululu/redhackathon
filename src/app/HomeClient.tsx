'use client'

import dynamic from 'next/dynamic'

const ProjectForm = dynamic(() => import('@/components/ProjectForm'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="w-6 h-6 border-2 border-green-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-dark text-sm">加载中...</p>
      </div>
    </div>
  ),
})

export default function HomeClient() {
  return <ProjectForm />
}
