'use client'
import React, { useEffect, useState } from 'react'
import { DSTheme, getDSTheme, setDSTheme, getEffectiveTheme } from '@/lib/theme-ds'

export function ThemeToggle() {
  const [current, setCurrent] = useState<DSTheme>('system')
  const [effective, setEffective] = useState<'light' | 'dark' | 'executive'>('light')

  useEffect(() => {
    const stored = getDSTheme()
    setCurrent(stored)
    setEffective(getEffectiveTheme())
  }, [])

  function cycle() {
    const order: DSTheme[] = ['light', 'dark', 'executive', 'system']
    const next = order[(order.indexOf(current) + 1) % order.length]
    setDSTheme(next)
    setCurrent(next)
    setEffective(getEffectiveTheme())
  }

  const labels: Record<DSTheme, string> = {
    light:     '☀ Light',
    dark:      '◑ Dark',
    executive: '◈ Executive',
    system:    '⊙ Auto',
  }

  return (
    <button
      onClick={cycle}
      title={`Theme: ${current} — click to cycle`}
      style={{
        fontSize: 'var(--ds-text-xs)',
        padding: '5px 10px',
        borderRadius: 'var(--ds-radius-md)',
        border: '0.5px solid var(--ds-border-medium)',
        background: 'transparent',
        color: 'var(--ds-topbar-text)',
        cursor: 'pointer',
        fontWeight: 'var(--ds-weight-medium)',
        transition: 'background 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {labels[current]}
    </button>
  )
}
