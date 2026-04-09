'use client'

import { useState, useRef, useEffect } from 'react'

type Option = {
  value: number
  label: string
  sub?: string
}

export default function WheelPicker({
  options,
  value,
  onChange,
  placeholder = '请选择...',
}: {
  options: Option[]
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(o => o.value === value)

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50)
    } else {
      setSearch('')
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full px-4 py-3.5 rounded-xl text-sm text-left outline-none transition-all border relative ${
          open
            ? 'border-green-primary bg-white/[0.05]'
            : 'border-gray-dark/30 bg-white/[0.03] hover:border-green-primary/50'
        }`}
      >
        <span className={`truncate ${selectedOption ? 'text-white' : 'text-gray-dark/60'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className={`absolute right-4 top-1/2 -translate-y-1/2 text-gray-dark transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-2 rounded-xl border border-gray-dark/20 bg-[#111] overflow-hidden shadow-2xl shadow-black/60">
          {/* Search */}
          <div className="p-3 border-b border-gray-dark/15">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-dark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索队伍名称..."
                className="w-full pl-9 pr-3 py-2.5 bg-white/[0.03] border border-gray-dark/20 rounded-lg text-white text-sm outline-none placeholder:text-gray-dark/40 focus:border-green-primary/40"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-dark text-sm">
                没有找到匹配的队伍
              </div>
            ) : (
              filtered.map(option => {
                const isSelected = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-green-primary/10 text-green-primary'
                        : 'text-gray-light hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {isSelected && (
                        <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00ce6d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                      <span className="text-sm truncate">{option.label}</span>
                    </div>
                    {option.sub && (
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                        option.sub === '软件赛道'
                          ? 'bg-green-primary/10 text-green-primary/70'
                          : 'bg-green-bright/10 text-green-bright/70'
                      }`}>
                        {option.sub}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
