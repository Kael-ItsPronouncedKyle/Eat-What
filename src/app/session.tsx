import { createContext, useContext } from 'react'
import type { Role } from '@/domain/types'

/** The active household and the list the signed-in user can switch between.
    Filled by the data layer provider; this file only defines the contract so the shell can render. */
export interface HouseholdSummary {
  id: string
  name: string
  role: Role
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

