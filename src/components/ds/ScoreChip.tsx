'use client'
import React from 'react'

interface ScoreChipProps {
  score: number
  size?: 'sm' | 'md'
  animate?: boolean
}

function getColors(score: number) {
  if (score >= 85) return { bg: 'var(--ds-red-100)',   color: 'var(--ds-red-600)',   darkBg: 'rgba(162,45,45,0.2)',    darkColor: '#FF8080' }
  if (score >= 70) return { bg: 'var(--ds-amber-100)', color: 'var(--ds-amber-600)', darkBg: 'rgba(133,79,11,0.25)',   darkColor: '#FFB347' }
  if (score >= 50) return { bg: 'var(--ds-blue-100)',  color: 'var(--ds-blue-600)',  darkBg: 'rgba(24,95,165,0.25)',   darkColor: 'var(--ds-blue-300)' }
  return             { bg: 'var(--ds-green-100)', color: 'var(--ds-green-600)', darkBg: 'rgba(59,109,17,0.25)',   darkColor: '#6DD47E' }
}

export function ScoreChip({ score, size = 'md', animate = true }: ScoreChipProps) {
  const c = getColors(score)
  const dim = size === 'sm' ? 28 : 36
  const fs  = size === 'sm' ? 11 : 13
  return (
    <div
      className={animate ? 'ds-score-pop' : ''}
      style={{
        width: dim, height: dim,
        borderRadius: 'var(--ds-radius-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: fs,
        fontWeight: 'var(--ds-weight-medium)',
        flexShrink: 0,
        background: c.bg,
        color: c.color,
      }}
    >{score}</div>
  )
}
