'use client'
import React from 'react'

type BadgeVariant = 'red' | 'blue' | 'green' | 'amber' | 'gray'

interface WidgetCardProps {
  title: string
  badge?: { label: string; variant: BadgeVariant }
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  noPad?: boolean
  style?: React.CSSProperties
}

const BADGE_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  red:   { bg: 'var(--ds-red-100)',   color: 'var(--ds-red-600)'   },
  blue:  { bg: 'var(--ds-blue-100)',  color: 'var(--ds-blue-600)'  },
  green: { bg: 'var(--ds-green-100)', color: 'var(--ds-green-600)' },
  amber: { bg: 'var(--ds-amber-100)', color: 'var(--ds-amber-600)' },
  gray:  { bg: 'var(--ds-surface-1)', color: 'var(--ds-text-secondary)' },
}

export function WidgetCard({ title, badge, action, children, className = '', noPad, style }: WidgetCardProps) {
  const bv = badge ? BADGE_STYLES[badge.variant] : null
  return (
    <div
      className={className}
      style={{
        background: 'var(--ds-card-bg)',
        border: '0.5px solid var(--ds-border-default)',
        borderRadius: 'var(--ds-radius-lg)',
        boxShadow: 'var(--ds-shadow-card)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', height: '100%',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 0', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--ds-text-sm)', fontWeight: 'var(--ds-weight-medium)', color: 'var(--ds-text-primary)', flex: 1 }}>
          {title}
        </span>
        {bv && badge && (
          <span style={{ fontSize: 'var(--ds-text-xs)', padding: '2px 8px', borderRadius: 8, fontWeight: 'var(--ds-weight-semi)', background: bv.bg, color: bv.color }}>
            {badge.label}
          </span>
        )}
        {action}
      </div>
      <div style={{ flex: 1, padding: noPad ? 0 : '10px 14px 14px', overflow: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
