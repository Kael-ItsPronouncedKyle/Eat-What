import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'

export interface UndoAction {
  id: number
  message: string
  undo?: () => void | Promise<void>
}

interface UndoContextValue {
  /** Show a 5 second undo bar. Returns the action id. */
  show: (message: string, undo?: () => void | Promise<void>) => number
  dismiss: () => void
}

const UndoContext = createContext<UndoContextValue | null>(null)

export const UNDO_MS = 5000

/** Spec rule: "Undo, not confirm". Status taps, Eat 1, Cook 1, add-to-list happen at once and show this bar. */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<UndoAction | null>(null)
  const timer = useRef<number | null>(null)
  const seq = useRef(0)

  const dismiss = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    setCurrent(null)
  }, [])

  const show = useCallback(
    (message: string, undo?: () => void | Promise<void>) => {
      if (timer.current) window.clearTimeout(timer.current)
      const id = ++seq.current
      setCurrent({ id, message, undo })
      timer.current = window.setTimeout(() => {
        timer.current = null
        setCurrent((c) => (c && c.id === id ? null : c))
      }, UNDO_MS)
      return id
    },
    [],
  )

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <UndoContext.Provider value={value}>
      {children}
      <div className="undo-region" role="status" aria-live="polite" aria-atomic="true">
        {current ? (
          <div className="undo-bar" data-testid="undo-bar">
            <span className="undo-message grow">{current.message}</span>
            {current.undo ? (
              <Button
                variant="ghost"
                size="md"
                icon="undo"
                onClick={async () => {
                  const u = current.undo
                  dismiss()
                  if (u) await u()
                }}
              >
                Undo
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </UndoContext.Provider>
  )
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used inside UndoProvider')
  return ctx
}
