import { createContext, useContext, type ReactNode } from 'react'

/** The active household and the list the signed-in user can switch between.
    Filled by the data layer provider; this file only defines the contract so the shell can render. */
export interface HouseholdSummary {
  id: string
  name: string
  role: 'owner' | 'editor' | 'viewer'
}

export interface SessionValue {
  userId: string
  household: HouseholdSummary | null
  households: HouseholdSummary[]
  switchHousehold: (id: string) => void
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

export function StaticSessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
