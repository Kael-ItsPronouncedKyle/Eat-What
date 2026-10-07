import { Route, Routes } from 'react-router'
import { SuggestionsFeed } from './SuggestionsFeed'
import { RecipeBank } from './RecipeBank'
import { RecipeDetail } from './RecipeDetail'
import { RecipeEditor } from './RecipeEditor'
import { WeekPlan } from './WeekPlan'
import { CookWeekBuilder } from './CookWeekBuilder'
import { CookMode } from './CookMode'
import './cook.css'

export function CookPage() {
  return (
    <Routes>
      <Route index element={<SuggestionsFeed />} />
      <Route path="recipes" element={<RecipeBank />} />
      <Route path="recipes/new" element={<RecipeEditor />} />
      <Route path="recipe/:id" element={<RecipeDetail />} />
      <Route path="recipe/:id/edit" element={<RecipeEditor />} />
      <Route path="plan" element={<WeekPlan />} />
      <Route path="week" element={<CookWeekBuilder />} />
      <Route path="week/:id" element={<CookWeekBuilder />} />
      <Route path="mode/:recipeId" element={<CookMode />} />
    </Routes>
  )
}
