import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithApp } from '@/test/render'
import { RecipeBank } from './RecipeBank'

describe('RecipeBank intake sheets', () => {
  afterEach(() => cleanup())

  it('opens the Import from URL sheet and says plainly that local mode has no backend', async () => {
    const user = userEvent.setup()
    await renderWithApp(<RecipeBank />, { route: '/cook/recipes', path: '/cook/recipes' })
    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Import from URL' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import from a link' })
    expect(within(dialog).getByLabelText('Recipe link')).toBeInTheDocument()
    expect(within(dialog).getByRole('note')).toHaveTextContent(/Supabase backend/)
    expect(within(dialog).getByRole('button', { name: 'Read the page' })).toBeDisabled()
  })

  it('opens the Make me a recipe sheet from ?generate= with the brief filled in', async () => {
    await renderWithApp(<RecipeBank />, { route: '/cook/recipes?generate=cheap%20crockpot%20dinner', path: '/cook/recipes' })
    const dialog = await screen.findByRole('dialog', { name: 'Make me a recipe' })
    expect(within(dialog).getByLabelText('What do you want?')).toHaveValue('cheap crockpot dinner')
  })
})
