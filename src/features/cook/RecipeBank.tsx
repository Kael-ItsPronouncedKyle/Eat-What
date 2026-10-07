import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { effortLabel } from '@/domain/effort'
import { Badge, Chip, EmptyState, Icon, TextField } from '@/design/components'

/** The household's recipe bank: searchable, filterable by cuisine and meal, with drafts badged. */
export function RecipeBank() {
  const data = useHouseholdData()
  const [q, setQ] = useState('')
  const [cuisine, setCuisine] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const cuisines = useMemo(() => [...new Set(data.recipes.map((r) => r.cuisine).filter((c): c is string => !!c))].sort(), [data.recipes])
  const recipes = useMemo(() => {
    const term = q.trim().toLowerCase()
    return data.recipesWithIngredients
      .filter((r) => (showArchived ? true : r.status !== 'archived'))
      .filter((r) => !cuisine || r.cuisine === cuisine)
      .filter((r) => !term || `${r.title} ${r.cuisine ?? ''} ${r.ingredients.map((i) => i.ingredientName).join(' ')}`.toLowerCase().includes(term))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [data.recipesWithIngredients, q, cuisine, showArchived])

  return (
    <div className="page">
      <BackHeader title="Recipes" to="/cook" right={<Link to="/cook/recipes/new" className="btn btn-primary"><Icon name="plus" /> <span className="btn-label">New</span></Link>} />
      <div className="stack">
        <TextField label="Search" placeholder="Title, cuisine, or ingredient" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mode-chips" role="group" aria-label="Cuisine">
          <Chip selected={cuisine === null} onClick={() => setCuisine(null)}>All</Chip>
          {cuisines.map((c) => (
            <Chip key={c} selected={cuisine === c} onClick={() => setCuisine(c)}>{c}</Chip>
          ))}
          <Chip selected={showArchived} onClick={() => setShowArchived(!showArchived)}>Show removed</Chip>
        </div>
      </div>
      <p className="muted small" style={{ margin: 'var(--space-3) 0' }}>{recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}. Import the full Neelix bank under House.</p>
      {recipes.length === 0 ? (
        <EmptyState icon="cook" title="No recipes match" body="Try another word, or add one." action={<Link to="/cook/recipes/new" className="btn btn-primary btn-lg">New recipe</Link>} />
      ) : (
        <div className="list" aria-label="Recipes">
          {recipes.map((r) => (
            <Link key={r.id} to={`/cook/recipe/${r.id}`} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="grow row-main">
                <div className="row-title">{r.title}</div>
                <div className="row-subtitle muted small row-wrap">
                  {r.cuisine ? <span>{r.cuisine}</span> : null}
                  {r.activeMinutes ? <span>{r.activeMinutes} min active</span> : null}
                  <span>{effortLabel(r.effortScore)}</span>
                  <span>{r.ingredients.length} ingredients</span>
                  {r.status === 'draft' ? <Badge tone="low">draft</Badge> : null}
                  {r.status === 'archived' ? <Badge>removed</Badge> : null}
                  {r.tags.includes('freezer_safe') ? <Badge tone="accent">freezer</Badge> : null}
                </div>
              </div>
              <Icon name="chevronRight" className="muted" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
