import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Container, FreezerBlock, Person, Recipe } from '@/domain/types'
import { guessFoodType, labelLines, qualityUntil } from '@/domain/labels'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useToday } from '@/app/hooks/useToday'
import { useSession } from '@/app/session'
import { PrintFrame } from './PrintFrame'

type LabelBlock = Pick<FreezerBlock, 'title' | 'portionLabel' | 'servingsPerBlock' | 'cookedOn' | 'qualityUntil' | 'foodType'>

interface LabelCard {
  key: string
  block: LabelBlock
  recipe: Recipe | null
  person: Person | null
  container: Container | null
  /** Containers this label covers: the blocks left on the shelf, or the count a planned batch will fill. */
  copies: number
}

/**
 * Freezer labels as a sheet of 2 x 4 inch boxes. `?blocks=id,id` prints the shelf blocks named; `?week=id` prints every
 * block the cook week made, and for batches not cooked yet, one box per container line from the plan.
 */
export function PrintLabels() {
  const [params] = useSearchParams()
  const data = useHouseholdData()
  const today = useToday()
  const { household } = useSession()
  const [perContainer, setPerContainer] = useState(false)
  const weekId = params.get('week')
  const blocksKey = params.get('blocks') ?? ''
  const blockIds = useMemo(() => blocksKey.split(',').map((s) => s.trim()).filter(Boolean), [blocksKey])

  const week = weekId ? (data.cook_weeks.find((w) => w.id === weekId) ?? null) : null
  const cards = useMemo<LabelCard[]>(() => {
    const recipeOf = (id: string | null) => (id ? (data.recipes.find((r) => r.id === id) ?? null) : null)
    const personOf = (id: string | null) => (id ? (data.persons.find((p) => p.id === id) ?? null) : null)
    const containerOf = (id: string | null) => (id ? (data.containers.find((c) => c.id === id) ?? null) : null)
    const fromBlock = (b: FreezerBlock): LabelCard => ({ key: b.id, block: b, recipe: recipeOf(b.recipeId), person: personOf(b.personId), container: containerOf(b.containerId), copies: Math.max(1, b.countRemaining > 0 ? b.countRemaining : b.countInitial) })

    if (blockIds.length) {
      return blockIds.map((id) => data.freezer_blocks.find((b) => b.id === id && !b.deletedAt)).filter((b): b is FreezerBlock => Boolean(b)).map(fromBlock)
    }
    if (!week) return []
    const out: LabelCard[] = []
    const batches = data.batches.filter((b) => b.cookWeekId === week.id && !b.deletedAt).sort((a, b) => (a.scheduledOn ?? '').localeCompare(b.scheduledOn ?? '') || a.createdAt.localeCompare(b.createdAt))
    for (const batch of batches) {
      const made = data.freezer_blocks.filter((fb) => fb.batchId === batch.id && !fb.deletedAt)
      if (made.length) {
        for (const fb of made) out.push(fromBlock(fb))
        continue
      }
      const recipe = recipeOf(batch.recipeId)
      if (!recipe) continue
      const cookedOn = batch.scheduledOn ?? today
      const foodType = guessFoodType(recipe)
      for (const line of batch.containerPlan) {
        if (line.count <= 0) continue
        out.push({
          key: `${batch.id}:${line.containerId}`,
          block: { title: recipe.title, portionLabel: line.portionLabel, servingsPerBlock: line.portionMl >= 480 ? 2 : 1, cookedOn, qualityUntil: qualityUntil(cookedOn, foodType), foodType },
          recipe,
          person: personOf(batch.cookPersonId),
          container: containerOf(line.containerId),
          copies: line.count,
        })
      }
    }
    return out
  }, [blockIds, week, data.recipes, data.persons, data.containers, data.freezer_blocks, data.batches, today])

  const backTo = week ? `/cook/week/${week.id}` : '/pantry/freezer'
  const backLabel = week ? 'Back to the cook week' : 'Back to the freezer shelf'
  const boxes = perContainer ? cards.flatMap((c) => Array.from({ length: Math.min(c.copies, 48) }, (_, i) => ({ ...c, key: `${c.key}#${i}` }))) : cards
  const houseName = household?.name ?? ''

  if (data.loading) return <div className="print-screen" aria-busy="true" />

  return (
    <PrintFrame
      title="freezer labels"
      backTo={backTo}
      backLabel={backLabel}
      options={
        <label>
          <input type="checkbox" checked={perContainer} onChange={(e) => setPerContainer(e.target.checked)} />
          One label for every container ({cards.reduce((n, c) => n + c.copies, 0)} in all)
        </label>
      }
    >
      <h1>Freezer labels</h1>
      <p className="paper-sub">{week ? week.name : weekId ? '' : `${cards.length} ${cards.length === 1 ? 'block' : 'blocks'} from the freezer shelf`}</p>
      {weekId && !week ? (
        <p className="paper-note">
          This cook week is not here any more. <Link to="/cook/week">Back to cook weeks</Link>
        </p>
      ) : boxes.length === 0 ? (
        <p className="paper-note">
          Nothing to print yet. {week ? 'Add a batch to the cook week first.' : 'Pick blocks on the freezer shelf first.'} <Link to={backTo}>{backLabel}</Link>
        </p>
      ) : (
        <ul className="label-grid" aria-label="Labels">
          {boxes.map((c) => {
            const [title, portion, dates, person, reheat] = labelLines(c.block, { recipe: c.recipe, person: c.person, container: c.container, format: 'sheet' })
            return (
              <li key={c.key} className="label-box" data-testid="label-box">
                <div>
                  <div className="label-title">{title}</div>
                  <div className="label-line">{portion}{!perContainer && c.copies > 1 ? ` · ${c.copies} containers` : ''}</div>
                  <div className="label-line">{dates}</div>
                  <div className="label-line">{person}</div>
                </div>
                <div>
                  <div className="label-reheat">{reheat}</div>
                  {houseName ? <div className="label-house">{houseName}</div> : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </PrintFrame>
  )
}
