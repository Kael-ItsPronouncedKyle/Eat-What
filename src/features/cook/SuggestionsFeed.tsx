import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { SuggestionFilters } from '@/domain/types'
import type { SuggestionMode } from '@/domain/suggestions'
import { ENERGY_LABEL, usePrefs } from '@/app/prefs'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { Chip, EmptyState, Icon, Segmented, Sheet, TextField, Toggle, Button } from '@/design/components'
import { SuggestionCard } from './SuggestionCard'
import { ALL_MODES, MODE_LABEL, useSuggestions } from './useSuggestions'

/** The Cook tab: suggestion feed with mode toggles and filters. */
export function SuggestionsFeed() {
  const data = useHouseholdData()
  const { prefs, setEnergy } = usePrefs()
  const [params] = useSearchParams()
  const initialMode = params.get('mode') as SuggestionMode | null
  const [modes, setModes] = useState<Set<SuggestionMode>>(() => new Set(initialMode && ALL_MODES.includes(initialMode) ? [initialMode] : ALL_MODES))
  const [filters, setFilters] = useState<SuggestionFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const [personId, setPersonId] = useState<string | null>(null)
  const effective = useMemo(() => ({ ...filters, search: filters.search?.trim() || undefined }), [filters])
  const suggestions = useSuggestions(data, modes, effective, personId)
  const activeFilterCount = Object.values(effective).filter((v) => v !== undefined && v !== false && v !== '' && !(Array.isArray(v) && v.length === 0)).length

  const toggleMode = (m: SuggestionMode) => {
    const next = new Set(modes)
    if (next.has(m)) next.delete(m)
    else next.add(m)
    setModes(next)
  }

  return (
    <div className="page">
      <div className="page-title">
        <h1>Cook</h1>
        <div className="row">
          <Link to="/cook/plan" className="btn btn-ghost"><Icon name="calendar" /> <span className="btn-label">Plan</span></Link>
          <Link to="/cook/recipes" className="btn btn-ghost"><Icon name="list" /> <span className="btn-label">Recipes</span></Link>
        </div>
      </div>

      <Segmented label="Energy today" value={prefs.energy} onChange={setEnergy} options={(['little', 'some', 'plenty'] as const).map((e) => ({ value: e, label: ENERGY_LABEL[e] }))} />

      <div className="mode-chips" role="group" aria-label="Suggestion modes" style={{ marginTop: 'var(--space-3)' }}>
        {ALL_MODES.map((m) => (
          <Chip key={m} selected={modes.has(m)} onClick={() => toggleMode(m)}>{MODE_LABEL[m]}</Chip>
        ))}
        <Chip selected={activeFilterCount > 0} icon="settings" onClick={() => setShowFilters(true)}>Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</Chip>
      </div>

      <div style={{ marginTop: 'var(--space-3)' }}>
        <TextField label="Search recipes" placeholder="chili, crockpot, Mexican" value={filters.search ?? ''} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
      </div>

      {data.persons.length > 1 ? (
        <div className="row-wrap" style={{ marginTop: 'var(--space-3)' }} role="group" aria-label="Plate">
          <Chip selected={personId === null} onClick={() => setPersonId(null)}>Everyone</Chip>
          {data.persons.map((p) => (
            <Chip key={p.id} selected={personId === p.id} onClick={() => setPersonId(p.id)}>{p.name}</Chip>
          ))}
        </div>
      ) : null}

      <div className="section stack">
        {data.loading ? null : suggestions.length === 0 ? (
          <EmptyState icon="cook" title={prefs.energy === 'little' ? 'Nothing easy enough fits right now' : 'Nothing fits right now'} body={prefs.energy === 'little' ? 'Try the freezer shelf, or set energy to "Some".' : 'Turn on more modes, loosen a filter, or add what you have to the pantry.'} action={<Link to="/pantry/freezer" className="btn btn-primary btn-lg">Open the freezer shelf</Link>} />
        ) : (
          suggestions.map((s) => <SuggestionCard key={s.recipe.id} s={s} />)
        )}
      </div>

      <Sheet open={showFilters} title="Filters" onClose={() => setShowFilters(false)} footer={<><Button variant="primary" size="lg" full onClick={() => setShowFilters(false)}>Show {suggestions.length} {suggestions.length === 1 ? 'recipe' : 'recipes'}</Button><Button size="md" full onClick={() => setFilters({})}>Clear filters</Button></>}>
        <div className="stack">
          <Segmented label="Missing items" value={filters.maxMissing === undefined ? 'any' : String(filters.maxMissing)} onChange={(v) => setFilters({ ...filters, maxMissing: v === 'any' ? undefined : (Number(v) as 0 | 1 | 2) })} options={[{ value: 'any', label: 'Any' }, { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }]} />
          <Segmented label="Active minutes" value={filters.maxActiveMinutes === undefined ? 'any' : String(filters.maxActiveMinutes)} onChange={(v) => setFilters({ ...filters, maxActiveMinutes: v === 'any' ? undefined : Number(v) })} options={[{ value: 'any', label: 'Any' }, { value: '15', label: '≤15' }, { value: '30', label: '≤30' }, { value: '60', label: '≤60' }]} />
          <Toggle label="Seated-friendly only" checked={!!filters.seatedFriendly} onChange={(v) => setFilters({ ...filters, seatedFriendly: v || undefined })} />
          <Toggle label="Freezer-safe only" checked={!!filters.freezerSafe} onChange={(v) => setFilters({ ...filters, freezerSafe: v || undefined })} />
          <Toggle label="One pot" checked={!!filters.tags?.includes('one_pot')} onChange={(v) => setFilters({ ...filters, tags: v ? [...(filters.tags ?? []), 'one_pot'] : (filters.tags ?? []).filter((t) => t !== 'one_pot') })} />
          <Toggle label="No chopping" checked={!!filters.tags?.includes('no_chop')} onChange={(v) => setFilters({ ...filters, tags: v ? [...(filters.tags ?? []), 'no_chop'] : (filters.tags ?? []).filter((t) => t !== 'no_chop') })} />
          <Toggle label="Crockpot" checked={!!filters.equipment?.includes('crockpot')} onChange={(v) => setFilters({ ...filters, equipment: v ? ['crockpot'] : undefined })} />
          <Toggle label="Cheapest per serving first" checked={!!filters.cheapest} onChange={(v) => setFilters({ ...filters, cheapest: v || undefined })} />
          <Segmented label="Calories per serving" value={filters.maxCalories === undefined ? 'any' : String(filters.maxCalories)} onChange={(v) => setFilters({ ...filters, maxCalories: v === 'any' ? undefined : Number(v) })} options={[{ value: 'any', label: 'Any' }, { value: '500', label: '<500' }, { value: '600', label: '<600' }, { value: '800', label: '<800' }]} />
          <Segmented label="Sodium per serving" value={filters.maxSodiumMg === undefined ? 'any' : String(filters.maxSodiumMg)} onChange={(v) => setFilters({ ...filters, maxSodiumMg: v === 'any' ? undefined : Number(v) })} options={[{ value: 'any', label: 'Any' }, { value: '700', label: '<700 mg' }, { value: '1000', label: '<1000 mg' }]} />
        </div>
      </Sheet>
    </div>
  )
}
