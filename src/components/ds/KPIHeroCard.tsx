'use client'
import React from 'react'

type HeroVariant = 'navy' | 'red' | 'amber' | 'teal'

interface KPIHeroCardProps {
  label: string
  value: string | number
  sub: string
  variant: HeroVariant
  ctaLabel?: string
  onCta?: () => void
  topBorder?: boolean
}

const V: Record<HeroVariant, { bg: string; num: string; text: string; cta: string }> = {
  navy:  { bg: 'var(--ds-hero-navy-bg)',  num: 'var(--ds-hero-navy-num)',  text: 'var(--ds-hero-navy-text)',  cta: 'rgba(255,255,255,0.15)' },
  red:   { bg: 'var(--ds-hero-red-bg)',   num: 'var(--ds-hero-red-num)',   text: 'var(--ds-hero-red-text)',   cta: 'rgba(162,45,45,0.12)'  },
  amber: { bg: 'var(--ds-hero-amber-bg)', num: 'var(--ds-hero-amber-num)', text: 'var(--ds-hero-amber-text)', cta: 'rgba(133,79,11,0.12)'  },
  teal:  { bg: 'var(--ds-hero-teal-bg)',  num: 'var(--ds-hero-teal-num)',  text: 'var(--ds-hero-teal-text)',  cta: 'rgba(8,80,65,0.12)'    },
}

export function KPIHeroCard({ label, value, sub, variant, ctaLabel, onCta, topBorder }: KPIHeroCardProps) {
  const v = V[variant]
  return (
    <div
      style={{
        background: v.bg,
        borderRadius: 'var(--ds-radius-lg)',
        padding: '16px 18px',
        borderTop: topBorder ? `3px solid ${v.num}` : 'none',
        display: 'flex', flexDirection: 'column', gap: 4,
        cursor: 'pointer',
        boxShadow: 'var(--ds-shadow-card)',
        transition: 'transform 0.15s var(--ds-ease-smooth), box-shadow 0.15s',
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(-1px)'; el.style.boxShadow = 'var(--ds-shadow-raised)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(0)'; el.style.boxShadow = 'var(--ds-shadow-card)' }}
    >
      <div style={{ fontSize: 'var(--ds-text-xs)', fontWeight: 'var(--ds-weight-semi)', letterSpacing: '0.08em', textTransform: 'uppercase', color: v.text, opacity: 0.8 }}>
        {label}
      </div>
      <div className="ds-score-pop" style={{ fontSize: 'var(--ds-text-4xl)', fontWeight: 'var(--ds-weight-medium)', lineHeight: 1, color: v.num }}>
        {value}
      </div>
      <div style={{ fontSize: 'var(--ds-text-xs)', color: v.text, lineHeight: 1.45, opacity: 0.8 }}>
        {sub}
      </div>
      {ctaLabel && (
        <div onClick={onCta} style={{ marginTop: 8, fontSize: 'var(--ds-text-xs)', fontWeight: 'var(--ds-weight-semi)', color: v.text, background: v.cta, padding: '4px 10px', borderRadius: 'var(--ds-radius-sm)', cursor: 'pointer', width: 'fit-content' }}>
          {ctaLabel} →
        </div>
      )}
    </div>
  )
}
