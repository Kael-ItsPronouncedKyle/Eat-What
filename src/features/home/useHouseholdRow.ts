import { useEffect, useState } from 'react'
import type { Household } from '@/domain/types'
import { useSession } from '@/app/session'
import { useCollection, useRepo } from '@/data/provider'

/** The active household's full row (budget cap, warn percent, ZIP).
    Reads the live collection first; when that yields nothing (the local adapter cannot list households by household id),
    falls back to a direct get and still refreshes on change. */
export function useHouseholdRow(): Household | null {
  const repo = useRepo()
  const { household } = useSession()
  const id = household?.id ?? null
  const col = useCollection('households', id)
  const fromList = col.rows.find((h) => h.id === id) ?? null
  const [fetched, setFetched] = useState<Household | null>(null)

  useEffect(() => {
    if (!id || col.loading || fromList) return
    let alive = true
    const load = () => {
      repo
        .table('households')
        .get(id)
        .then((h) => {
          if (alive) setFetched(h)
        })
        .catch(() => {
          if (alive) setFetched(null)
        })
    }
    load()
    const off = repo.subscribe((e) => {
      if (e.table === 'households') load()
    })
    return () => {
      alive = false
      off()
    }
  }, [repo, id, col.loading, fromList])

  if (fromList) return fromList
  return fetched && fetched.id === id ? fetched : null
}
