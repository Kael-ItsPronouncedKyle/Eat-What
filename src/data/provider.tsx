import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Repository, SessionInfo, TableMap, TableName } from './repository'
import { SessionContext, type HouseholdSummary, type SessionValue } from '@/app/session'

const RepositoryContext = createContext<Repository | null>(null)

export function useRepo(): Repository {
  const r = useContext(RepositoryContext)
  if (!r) throw new Error('useRepo must be used inside RepositoryProvider')
  return r
}

interface SessionState {
  info: SessionInfo | null
  loading: boolean
  error: string | null
}

/** Provides the repository and the session (active household) to the whole app. */
export function RepositoryProvider({ repo, children, fallback, noHousehold }: { repo: Repository; children: ReactNode; fallback?: ReactNode; noHousehold?: (reload: () => void) => ReactNode }) {
  const [state, setState] = useState<SessionState>({ info: null, loading: true, error: null })

  const reload = useCallback(async () => {
    try {
      const info = await repo.session()
      setState({ info, loading: false, error: null })
    } catch (e) {
      setState({ info: null, loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  }, [repo])

  useEffect(() => {
    void reload()
    return repo.subscribe((e) => {
      if (e.table === 'households' || e.table === 'memberships') void reload()
    })
  }, [repo, reload])

  const sessionValue = useMemo<SessionValue | null>(() => {
    if (!state.info) return null
    const households: HouseholdSummary[] = state.info.households.map((h) => ({ id: h.household.id, name: h.household.name, role: h.role }))
    const household = households.find((h) => h.id === state.info!.activeHouseholdId) ?? null
    return {
      userId: state.info.userId,
      household,
      households,
      switchHousehold: (id: string) => {
        void repo.setActiveHousehold(id).then(reload)
      },
    }
  }, [state.info, repo, reload])

  if (state.loading) return <>{fallback ?? null}</>
  if (sessionValue && sessionValue.households.length === 0 && noHousehold) {
    return (
      <RepositoryContext.Provider value={repo}>
        <SessionContext.Provider value={sessionValue}>{noHousehold(() => void reload())}</SessionContext.Provider>
      </RepositoryContext.Provider>
    )
  }
  if (!sessionValue) {
    return (
      <div className="page">
        <h1>Could not load</h1>
        <p className="muted">{state.error ?? 'No session.'}</p>
      </div>
    )
  }
  return (
    <RepositoryContext.Provider value={repo}>
      <SessionContext.Provider value={sessionValue}>{children}</SessionContext.Provider>
    </RepositoryContext.Provider>
  )
}

export interface CollectionState<T> {
  rows: T[]
  loading: boolean
  error: string | null
  reload: () => void
}

/** Live list of one table for a household. Re-fetches when the repository reports a change on that table. */
export function useCollection<K extends TableName>(name: K, householdId: string | null | undefined): CollectionState<TableMap[K]> {
  const repo = useRepo()
  const [rows, setRows] = useState<TableMap[K][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const version = useRef(0)

  const reload = useCallback(() => {
    if (!householdId) {
      setRows([])
      setLoading(false)
      return
    }
    const v = ++version.current
    repo
      .table(name)
      .list(householdId)
      .then((r) => {
        if (v !== version.current) return
        setRows(r)
        setLoading(false)
        setError(null)
      })
      .catch((e: unknown) => {
        if (v !== version.current) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [repo, name, householdId])

  useEffect(() => {
    reload()
    return repo.subscribe((e) => {
      if (e.table === name && (e.householdId === householdId || e.householdId === null)) reload()
    })
  }, [repo, name, householdId, reload])

  return { rows, loading, error, reload }
}

/** Several tables at once, keyed by name. */
export function useCollections<K extends TableName>(names: readonly K[], householdId: string | null | undefined): { [P in K]: TableMap[P][] } & { loading: boolean } {
  const repo = useRepo()
  const [data, setData] = useState<Record<string, unknown[]>>({})
  const [loading, setLoading] = useState(true)
  const key = names.join(',')
  const version = useRef(0)

  const reload = useCallback(
    (only?: TableName) => {
      if (!householdId) {
        setData({})
        setLoading(false)
        return
      }
      const v = ++version.current
      const targets = only ? names.filter((n) => n === only) : names
      Promise.all(targets.map((n) => repo.table(n).list(householdId).then((rows) => [n, rows] as const))).then((pairs) => {
        if (v !== version.current && !only) return
        setData((prev) => {
          const next = { ...prev }
          for (const [n, rows] of pairs) next[n] = rows
          return next
        })
        setLoading(false)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repo, key, householdId],
  )

  useEffect(() => {
    reload()
    return repo.subscribe((e) => {
      if ((names as readonly TableName[]).includes(e.table) && (e.householdId === householdId || e.householdId === null)) reload(e.table)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, key, householdId, reload])

  const out = { loading } as { [P in K]: TableMap[P][] } & { loading: boolean }
  for (const n of names) (out as Record<string, unknown>)[n] = data[n] ?? []
  return out
}
