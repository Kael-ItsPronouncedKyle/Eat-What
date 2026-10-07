import { useMemo } from 'react'
import type { SuggestionFilters } from '@/domain/types'
import { suggest, type Suggestion, type SuggestionMode } from '@/domain/suggestions'
import { usePrefs } from '@/app/prefs'
import { useToday } from '@/app/hooks/useToday'
import type { HouseholdData } from '@/app/hooks/useHouseholdData'

export const ALL_MODES: SuggestionMode[] = ['make_now', 'almost_there', 'use_it_up', 'freezer_first']
export const MODE_LABEL: Record<SuggestionMode, string> = { make_now: 'Make it now', almost_there: 'Almost there', use_it_up: 'Use it up', freezer_first: 'Freezer first' }

/** Suggestions for the active household with the daily energy applied. */
export function useSuggestions(data: HouseholdData, modes: Set<SuggestionMode>, filters?: SuggestionFilters, personId?: string | null): Suggestion[] {
  const today = useToday()
  const { prefs } = usePrefs()
  return useMemo(() => {
    if (!data.householdId || data.loading) return []
    try {
      return suggest({
        recipes: data.recipesWithIngredients,
        items: data.items,
        aliases: data.item_aliases,
        alwaysHave: data.alwaysHave,
        freezerBlocks: data.freezer_blocks,
        rules: data.rules,
        persons: data.persons,
        prices: data.prices,
        today,
        energy: prefs.energy,
        modes,
        filters,
        personId: personId ?? null,
      })
    } catch (e) {
      console.error('suggest failed', e)
      return []
    }
  }, [data.householdId, data.loading, data.recipesWithIngredients, data.items, data.item_aliases, data.alwaysHave, data.freezer_blocks, data.rules, data.persons, data.prices, today, prefs.energy, modes, filters, personId])
}
