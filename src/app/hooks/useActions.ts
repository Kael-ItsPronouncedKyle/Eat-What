import { useCallback, useMemo } from 'react'
import { useSession } from '@/app/session'
import { useRepo } from '@/data/provider'
import { useUndo } from '@/design/components'
import type { Actor, Undoable } from '@/data/mutations'
import type { ActivitySource } from '@/domain/types'

/** The signed-in actor for activity logging. */
export function useActor(source: ActivitySource = 'tap'): Actor {
  const { userId } = useSession()
  return useMemo(() => ({ userId, source }), [userId, source])
}

/** Run an undoable mutation and show the 5-second undo bar with its summary. */
export function useUndoable() {
  const repo = useRepo()
  const actor = useActor()
  const { show } = useUndo()
  const run = useCallback(
    async (fn: (repo: ReturnType<typeof useRepo>, actor: Actor) => Promise<Undoable>, message?: string) => {
      const result = await fn(repo, actor)
      show(message ?? result.event.summary, result.undo)
      return result
    },
    [repo, actor, show],
  )
  return { run, repo, actor }
}
