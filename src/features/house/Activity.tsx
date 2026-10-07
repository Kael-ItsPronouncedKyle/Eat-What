import { useMemo, useState } from 'react'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useCollection } from '@/data/provider'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { relativeDay } from '@/domain/dates'
import { Badge, Button, Chip, EmptyState, Icon } from '@/design/components'
import { undoEvent } from './mutations'

/** Every change with undo (spec: activity feed). Reverses from the stored before/after snapshots. */
export function Activity() {
  const { household } = useSession()
  const today = useToday()
  const { repo, actor } = useUndoable()
  const events = useCollection('activity_events', household?.id)
  const profiles = useCollection('profiles', household?.id)
  const [filter, setFilter] = useState<'all' | 'voice' | 'items' | 'list' | 'plan'>('all')

  const rows = useMemo(() => {
    const sorted = events.rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (filter === 'voice') return sorted.filter((e) => e.source === 'voice' || e.partnerTurnId)
    if (filter === 'items') return sorted.filter((e) => e.entityType === 'items' || e.entityType === 'freezer_blocks')
    if (filter === 'list') return sorted.filter((e) => e.entityType === 'list_lines' || e.entityType === 'list_sends')
    if (filter === 'plan') return sorted.filter((e) => e.entityType === 'plan_entries' || e.entityType === 'batches' || e.entityType === 'cook_weeks')
    return sorted
  }, [events.rows, filter])

  const who = (id: string | null) => profiles.rows.find((p) => p.userId === id)?.displayName ?? (id ? 'Someone' : 'System')

  return (
    <div className="page">
      <BackHeader title="Activity" to="/house" />
      <div className="row-wrap" style={{ marginBottom: 'var(--space-4)' }} role="group" aria-label="Filter">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
        <Chip selected={filter === 'items'} onClick={() => setFilter('items')}>Pantry</Chip>
        <Chip selected={filter === 'list'} onClick={() => setFilter('list')}>List</Chip>
        <Chip selected={filter === 'plan'} onClick={() => setFilter('plan')}>Plan</Chip>
        <Chip selected={filter === 'voice'} onClick={() => setFilter('voice')}>Voice</Chip>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="list" title="Nothing yet" body="Changes you make show up here with an undo button." />
      ) : (
        <div className="card card-padded">
          {rows.slice(0, 200).map((e) => {
            const undone = !!e.undoneByEventId
            const canUndo = !undone && e.action !== 'undo' && !!e.entityId && (e.action === 'insert' || !!e.before)
            return (
              <div key={e.id} className="activity-row">
                <span className="activity-when">{relativeDay(e.createdAt.slice(0, 10), today)}</span>
                <div className="grow">
                  <div className={undone ? 'activity-undone' : ''}>{e.summary}</div>
                  <div className="small muted row-wrap">
                    <span>{who(e.actorUserId)}</span>
                    {e.source !== 'tap' ? <Badge>{e.source}</Badge> : null}
                    {undone ? <Badge>undone</Badge> : null}
                  </div>
                </div>
                {canUndo ? (
                  <Button variant="ghost" size="sm" aria-label={`Undo: ${e.summary}`} onClick={() => void undoEvent(repo, e, actor)}>
                    <Icon name="undo" /> Undo
                  </Button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
