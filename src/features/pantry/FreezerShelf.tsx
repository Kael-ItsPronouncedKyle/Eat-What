import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { FreezerBlock } from '@/domain/types'
import { daysBetween, formatDate } from '@/domain/dates'
import { labelText } from '@/domain/labels'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { Badge, Button, Card, Chip, EmptyState, Icon } from '@/design/components'
import { eatFreezerBlock } from '@/data/mutations'

type Sort = 'oldest' | 'spot' | 'person'

/** The freezer shelf: one card per block group, oldest first (first in, first out), Eat 1 on every card. */
export function FreezerShelf() {
  const data = useHouseholdData()
  const today = useToday()
  const { run } = useUndoable()
  const [sort, setSort] = useState<Sort>('oldest')
  const [showEmpty, setShowEmpty] = useState(false)

  const blocks = useMemo(() => {
    const list = data.freezer_blocks.filter((b) => showEmpty || b.countRemaining > 0)
    return list.sort((a, b) => (a.cookedOn ?? '').localeCompare(b.cookedOn ?? '') || (a.qualityUntil ?? '').localeCompare(b.qualityUntil ?? ''))
  }, [data.freezer_blocks, showEmpty])

  const groups = useMemo(() => {
    if (sort === 'oldest') return [{ key: 'all', title: null as string | null, blocks }]
    const map = new Map<string, FreezerBlock[]>()
    for (const b of blocks) {
      const key = sort === 'spot' ? (b.freezerSpot ?? 'No spot') : (data.persons.find((p) => p.id === b.personId)?.name ?? 'Ours')
      map.set(key, [...(map.get(key) ?? []), b])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bs]) => ({ key, title: key, blocks: bs }))
  }, [blocks, sort, data.persons])

  const total = blocks.reduce((n, b) => n + b.countRemaining, 0)

  if (data.loading) return <div className="page" aria-busy="true" />

  return (
    <div className="page">
      <BackHeader
        title="Freezer shelf"
        to="/pantry"
        right={
          <Link to="/cook/week" className="btn btn-secondary">
            <Icon name="snowflake" /> <span className="btn-label">Cook week</span>
          </Link>
        }
      />
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
        {total === 0 ? 'Nothing frozen right now.' : `${total} ${total === 1 ? 'block' : 'blocks'} ready. Oldest first, so nothing hides in the back.`}
      </p>
      <div className="row-wrap" style={{ marginBottom: 'var(--space-4)' }} role="group" aria-label="Sort">
        <Chip selected={sort === 'oldest'} onClick={() => setSort('oldest')}>Oldest first</Chip>
        <Chip selected={sort === 'spot'} onClick={() => setSort('spot')}>By spot</Chip>
        <Chip selected={sort === 'person'} onClick={() => setSort('person')}>By person</Chip>
        <Chip selected={showEmpty} onClick={() => setShowEmpty(!showEmpty)}>Show empty</Chip>
      </div>

      {blocks.length === 0 ? (
        <EmptyState icon="snowflake" title="The shelf is empty" body="Plan a cook week and the batches land here with labels." action={<Link to="/cook/week" className="btn btn-primary btn-lg">Plan a cook week</Link>} />
      ) : (
        groups.map((g) => (
          <section key={g.key} className={g.title ? 'spot-group' : ''}>
            {g.title ? (
              <h3>
                <Icon name={sort === 'spot' ? 'snowflake' : 'person'} /> {g.title}
              </h3>
            ) : null}
            <div className="freezer-grid">
              {g.blocks.map((b) => (
                <BlockCard key={b.id} block={b} today={today} onEat={() => void run((repo, actor) => eatFreezerBlock(repo, b, actor))} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

export function BlockCard({ block, today, onEat }: { block: FreezerBlock; today: string; onEat: () => void }) {
  const data = useHouseholdData()
  const person = data.persons.find((p) => p.id === block.personId) ?? null
  const recipe = data.recipes.find((r) => r.id === block.recipeId) ?? null
  const container = data.containers.find((c) => c.id === block.containerId) ?? null
  const daysLeft = block.qualityUntil ? daysBetween(today, block.qualityUntil) : null
  const age = block.cookedOn ? daysBetween(block.cookedOn, today) : null
  let tape = block.title
  try {
    tape = labelText(block, { recipe, person, container, format: 'tape' })
  } catch {
    /* label module not ready */
  }
  return (
    <Card tone={block.countRemaining === 0 ? 'neutral' : daysLeft !== null && daysLeft <= 14 ? 'low' : 'accent'} className="block-card">
      <Link to={`/pantry/freezer/${block.id}`} className="tap-link" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="tape-label">{tape}</span>
      </Link>
      <div className="spread">
        <div>
          <div className="block-count num" aria-label={`${block.countRemaining} left`}>
            {block.countRemaining}
            <span className="small muted" style={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}> left</span>
          </div>
          <div className="block-spot">
            {block.freezerSpot ? `${block.freezerSpot} · ` : ''}
            {age !== null ? `${age} days old` : ''}
            {daysLeft !== null ? (daysLeft < 0 ? ` · past best by ${formatDate(block.qualityUntil!)}` : ` · best by ${formatDate(block.qualityUntil!)}`) : ''}
          </div>
          <div className="row-wrap" style={{ marginTop: 6 }}>
            {person ? <Badge tone="accent">{person.name}</Badge> : null}
            {daysLeft !== null && daysLeft < 0 ? <Badge tone="low">eat soon</Badge> : null}
          </div>
        </div>
      </div>
      <Button variant="primary" size="lg" full icon="check" onClick={onEat} disabled={block.countRemaining === 0} aria-label={`Eat 1 ${block.title}`}>
        Eat 1
      </Button>
    </Card>
  )
}
