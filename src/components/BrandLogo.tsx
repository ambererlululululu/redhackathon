/** 官方主视觉 logo：竖版布局，适配深色底（登录页用） */
export default function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/hackathon-logo-v.png"
      alt="RED HACKATHON"
      className={`h-auto w-auto max-w-full object-contain ${className}`}
      decoding="async"
    />
  )
}
