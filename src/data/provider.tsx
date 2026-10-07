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

const EMPTY: never[] = []

/** Live list of one table for a household. Re-fetches when the repository reports a change on that table.
    Rows are tagged with the table and household they were loaded for, so a household switch never shows the previous
    household's rows while the new ones load. */
export function useCollection<K extends TableName>(name: K, householdId: string | null | undefined): CollectionState<TableMap[K]> {
  const repo = useRepo()
  const tag = householdId ? `${name}|${householdId}` : null
  const [state, setState] = useState<{ tag: string | null; rows: TableMap[K][]; error: string | null }>({ tag: null, rows: [], error: null })
  const version = useRef(0)

  const reload = useCallback(() => {
    if (!householdId || !tag) return
    const v = ++version.current
    repo
      .table(name)
      .list(householdId)
      .then((rows) => {
        if (v === version.current) setState({ tag, rows, error: null })
      })
      .catch((e: unknown) => {
        if (v === version.current) setState({ tag, rows: [], error: e instanceof Error ? e.message : String(e) })
      })
  }, [repo, name, householdId, tag])

  useEffect(() => {
    reload()
    return repo.subscribe((e) => {
      if (e.table === name && (e.householdId === householdId || e.householdId === null)) reload()
    })
  }, [repo, name, householdId, reload])

  const current = tag !== null && state.tag === tag
  return {
    rows: current ? state.rows : (EMPTY as TableMap[K][]),
    loading: tag !== null && !current,
    error: current ? state.error : null,
    reload,
  }
}

/** Several tables at once, keyed by name. A full load replaces everything for the household; a change event on one table
    reloads just that table. A change that lands while the full load is in flight is re-read once the full load settles, so
    neither result is thrown away and a stale read cannot overwrite a newer one. */
export function useCollections<K extends TableName>(names: readonly K[], householdId: string | null | undefined): { [P in K]: TableMap[P][] } & { loading: boolean } {
  const repo = useRepo()
  const key = names.join(',')
  const tag = householdId ? `${key}|${householdId}` : null
  const [state, setState] = useState<{ tag: string | null; data: Record<string, unknown[]> }>({ tag: null, data: {} })
  const fullVersion = useRef(0)
  const fullInFlight = useRef(false)
  const dirty = useRef(new Set<TableName>())
  const tableVersion = useRef<Record<string, number>>({})

  const reload = useCallback(
    (only?: TableName) => {
      if (!householdId || !tag) return
      if (only) {
        if (fullInFlight.current) {
          dirty.current.add(only)
          return
        }
        const v = (tableVersion.current[only] = (tableVersion.current[only] ?? 0) + 1)
        const full = fullVersion.current
        repo
          .table(only)
          .list(householdId)
          .then((rows) => {
            if (v !== tableVersion.current[only] || full !== fullVersion.current) return
            setState((prev) => (prev.tag === tag ? { tag, data: { ...prev.data, [only]: rows } } : prev))
          })
          .catch(() => undefined)
        return
      }
      const v = ++fullVersion.current
      fullInFlight.current = true
      dirty.current.clear()
      Promise.all(names.map((n) => repo.table(n).list(householdId).then((rows) => [n, rows] as const)))
        .then((pairs) => {
          if (v === fullVersion.current) setState({ tag, data: Object.fromEntries(pairs) })
        })
        .catch(() => {
          if (v === fullVersion.current) setState({ tag, data: {} })
        })
        .finally(() => {
          if (v !== fullVersion.current) return
          fullInFlight.current = false
          const again = [...dirty.current]
          dirty.current.clear()
          for (const t of again) reload(t)
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repo, key, householdId, tag],
  )

  useEffect(() => {
    reload()
    return repo.subscribe((e) => {
      if ((names as readonly TableName[]).includes(e.table) && (e.householdId === householdId || e.householdId === null)) reload(e.table)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, key, householdId, reload])

  const current = tag !== null && state.tag === tag
  const out = { loading: tag !== null && !current } as { [P in K]: TableMap[P][] } & { loading: boolean }
  for (const n of names) (out as Record<string, unknown>)[n] = current ? (state.data[n] ?? EMPTY) : EMPTY
  return out
}
