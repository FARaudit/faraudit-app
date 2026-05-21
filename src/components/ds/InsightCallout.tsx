'use client'
import React from 'react'

interface InsightCalloutProps {
  text: string
  loading?: boolean
}

export function InsightCallout({ text, loading = false }: InsightCalloutProps) {
  const base: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 'var(--ds-radius-sm)',
    borderLeft: '2px solid var(--ds-blue-300)',
    background: 'var(--ds-blue-100)',
    marginTop: 6,
  }

  if (loading) {
    return (
      <div style={base}>
        <div className="ds-ai-skeleton" style={{ height: 9, width: '75%', marginBottom: 4 }} />
        <div className="ds-ai-skeleton" style={{ height: 9, width: '50%' }} />
      </div>
    )
  }

  return (
    <div className="ds-slide-in" style={{ ...base, fontSize: 'var(--ds-text-xs)', color: 'var(--ds-blue-600)', lineHeight: 1.5 }}>
      <span style={{ fontSize: 9, opacity: 0.6, marginRight: 5, letterSpacing: '0.06em' }}>▲ AI</span>
      {text}
    </div>
  )
}
