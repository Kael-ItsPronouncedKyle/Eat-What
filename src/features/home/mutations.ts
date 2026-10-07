import type { PlanEntry } from '@/domain/types'
import type { BadDayResult } from '@/domain/plan'
import { newId } from '@/domain/ids'
import { insertRow, logEvent, replaceRow, type Actor, type Undoable } from '@/data/mutations'
import { nowIso, type Repository } from '@/data/repository'

/** Apply a Bad day: move each displaced cook, then put tonight's pick on the plan.
    Every row change goes through replaceRow/insertRow so the activity feed sees it; one event and one undo cover the whole thing. */
export async function applyBadDay(
  repo: Repository,
  householdId: string,
  result: BadDayResult,
  actor: Actor,
  tonightTitle: string | null,
): Promise<Undoable & { tonight: PlanEntry | null }> {
  const steps: Undoable[] = []
  for (const change of result.changes) {
    const after: PlanEntry = { ...change.entry, ...change.patch, updatedAt: nowIso(), updatedBy: actor.userId }
    steps.push(await replaceRow(repo, 'plan_entries', change.entry, after, actor, change.text, 'move'))
  }
  let tonight: PlanEntry | null = null
  if (result.tonight) {
    const now = nowIso()
    tonight = { id: newId(), createdAt: now, createdBy: actor.userId, updatedAt: now, updatedBy: actor.userId, deletedAt: null, ...result.tonight }
    steps.push(await insertRow(repo, 'plan_entries', tonight, actor, `Tonight: ${tonightTitle ?? 'something easy'}`))
  }
  const event = await logEvent(repo, householdId, actor, {
    entityType: 'plan_entries',
    entityId: tonight?.id ?? null,
    action: 'bad_day',
    summary: result.message,
    after: { moved: result.changes.map((c) => c.text), tonight },
  })
  return {
    event,
    tonight,
    undo: async () => {
      for (const step of steps.slice().reverse()) await step.undo()
      const undoEvent = await logEvent(repo, householdId, actor, { entityType: 'plan_entries', entityId: tonight?.id ?? null, action: 'undo', summary: 'Undid: Bad day', undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undoEvent.id })
    },
  }
}
