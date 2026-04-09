/** 官方主视觉 logo：public/red-hackathon-logo.svg（红 + 白字图形，适配深色底） */
export default function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/red-hackathon-logo.svg"
      alt="RED HACKATHON"
      className={`h-auto w-auto max-w-full object-contain ${className}`}
      decoding="async"
    />
  )
}
