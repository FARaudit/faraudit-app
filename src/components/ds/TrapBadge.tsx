'use client'
import React from 'react'

type Severity = 'P0' | 'P1' | 'P2'

interface TrapBadgeProps {
  severity: Severity
  label?: string
  animate?: boolean
}

const STYLES: Record<Severity, { bg: string; color: string; dot: string }> = {
  P0: { bg: 'var(--ds-red-100)',   color: 'var(--ds-red-600)',   dot: 'var(--ds-red-500)'   },
  P1: { bg: 'var(--ds-amber-100)', color: 'var(--ds-amber-600)', dot: 'var(--ds-amber-400)' },
  P2: { bg: 'var(--ds-blue-100)',  color: 'var(--ds-blue-600)',  dot: 'var(--ds-blue-500)'  },
}

export function TrapBadge({ severity, label, animate }: TrapBadgeProps) {
  const s = STYLES[severity]
  return (
    <span
      className={animate ? 'ds-score-pop' : ''}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 'var(--ds-text-xs)',
        fontWeight: 'var(--ds-weight-semi)',
        padding: '2px 8px',
        borderRadius: 8,
        background: s.bg,
        color: s.color,
        border: `0.5px solid ${s.dot}`,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {severity}{label ? ` · ${label}` : ''}
    </span>
  )
}
