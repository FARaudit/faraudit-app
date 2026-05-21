/**
 * FARaudit Design System — Theme Manager
 * Supports: light · dark · executive · system (auto)
 * Persists to localStorage, respects prefers-color-scheme
 */

export type DSTheme = 'light' | 'dark' | 'executive' | 'system'

const STORAGE_KEY = 'faraudit-ds-theme'
const ROOT = () => document.documentElement

export function getDSTheme(): DSTheme {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem(STORAGE_KEY) as DSTheme) ?? 'system'
}

export function setDSTheme(theme: DSTheme): void {
  if (typeof window === 'undefined') return
  const root = ROOT()

  if (theme === 'system') {
    localStorage.removeItem(STORAGE_KEY)
    root.removeAttribute('data-theme')
    // Let prefers-color-scheme CSS media query take over
  } else {
    localStorage.setItem(STORAGE_KEY, theme)
    root.setAttribute('data-theme', theme)
  }
}

export function initDSTheme(): void {
  if (typeof window === 'undefined') return
  const stored = localStorage.getItem(STORAGE_KEY) as DSTheme | null
  if (stored && stored !== 'system') {
    ROOT().setAttribute('data-theme', stored)
  }
  // If no stored pref: no data-theme set → CSS media query handles it
}

export function getEffectiveTheme(): 'light' | 'dark' | 'executive' {
  const stored = getDSTheme()
  if (stored === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return stored as 'light' | 'dark' | 'executive'
}
