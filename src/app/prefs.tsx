import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type TextSize = 'A' | 'A+' | 'A++'
export type Theme = 'system' | 'light' | 'dark'
export type Contrast = 'normal' | 'high'
export type FontChoice = 'default' | 'reading'
export type Motion = 'system' | 'reduced'
export type Hand = 'right' | 'left'
/** Daily energy: a little / some / plenty. Resets each morning (stored with the date it was set). */
export type Energy = 'little' | 'some' | 'plenty'

export interface Prefs {
  textSize: TextSize
  theme: Theme
  contrast: Contrast
  font: FontChoice
  motion: Motion
  hand: Hand
  energy: Energy
  energyDate: string
  readAloud: boolean
}

const DEFAULTS: Prefs = {
  textSize: 'A',
  theme: 'system',
  contrast: 'normal',
  font: 'default',
  motion: 'system',
  hand: 'right',
  energy: 'some',
  energyDate: '',
  readAloud: false,
}

const KEY = 'qm.prefs.v1'

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) }
    // Energy resets each morning.
    if (parsed.energyDate !== todayKey()) {
      parsed.energy = DEFAULTS.energy
      parsed.energyDate = todayKey()
    }
    return parsed
  } catch {
    return DEFAULTS
  }
}

function applyToDocument(p: Prefs) {
  const el = document.documentElement
  el.dataset.textSize = p.textSize
  if (p.theme === 'system') delete el.dataset.theme
  else el.dataset.theme = p.theme
  if (p.contrast === 'high') el.dataset.contrast = 'high'
  else delete el.dataset.contrast
  if (p.font === 'reading') el.dataset.font = 'reading'
  else delete el.dataset.font
  if (p.motion === 'reduced') el.dataset.motion = 'reduced'
  else delete el.dataset.motion
  el.dataset.hand = p.hand
}

interface PrefsContextValue {
  prefs: Prefs
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
  cycleTextSize: () => void
  setEnergy: (e: Energy) => void
}

const PrefsContext = createContext<PrefsContextValue | null>(null)

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load)

  useEffect(() => {
    applyToDocument(prefs)
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* private mode: prefs live for the session only */
    }
  }, [prefs])

  const set = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }))
  }, [])

  const cycleTextSize = useCallback(() => {
    setPrefs((p) => ({ ...p, textSize: p.textSize === 'A' ? 'A+' : p.textSize === 'A+' ? 'A++' : 'A' }))
  }, [])

  const setEnergy = useCallback((energy: Energy) => {
    setPrefs((p) => ({ ...p, energy, energyDate: todayKey() }))
  }, [])

  const value = useMemo(() => ({ prefs, set, cycleTextSize, setEnergy }), [prefs, set, cycleTextSize, setEnergy])
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider')
  return ctx
}

export const TEXT_SIZES: TextSize[] = ['A', 'A+', 'A++']
export const ENERGY_LABEL: Record<Energy, string> = { little: 'A little', some: 'Some', plenty: 'Plenty' }
