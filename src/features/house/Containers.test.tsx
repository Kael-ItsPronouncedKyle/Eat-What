import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithApp } from '@/test/render'
import { HousePage } from './HousePage'

const PATH = '/house/*'

describe('Containers (Freezer kit)', () => {
  afterEach(() => cleanup())

  it('shows trays x cavities = blocks for the Denton Souper Cubes kit', async () => {
    await renderWithApp(<HousePage />, { route: '/house/containers', path: PATH })
    expect(await screen.findByRole('heading', { name: 'Freezer kit' })).toBeInTheDocument()
    expect(await screen.findByText('2 trays x 4 cavities = 8 blocks')).toBeInTheDocument()
    expect(screen.getByText('2 trays x 6 cavities = 12 blocks')).toBeInTheDocument()
    expect(screen.getByText('1 tray x 8 cavities = 8 blocks')).toBeInTheDocument()
    expect(screen.getByText('20 bags')).toBeInTheDocument()
  })

  it('the cavities stepper writes through the repository with undo', async () => {
    const user = userEvent.setup()
    const { repo } = await renderWithApp(<HousePage />, { route: '/house/containers', path: PATH })
    const group = await screen.findByRole('group', { name: 'Souper Cubes 2-cup cavities' })
    await user.click(within(group).getByRole('button', { name: 'Increase Souper Cubes 2-cup cavities' }))
    expect(await screen.findByText('2 trays x 5 cavities = 10 blocks')).toBeInTheDocument()
    expect(await screen.findByTestId('undo-bar')).toBeInTheDocument()
    const denton = (await repo.session()).activeHouseholdId!
    const rows = await repo.table('containers').list(denton)
    expect(rows.find((c) => c.name === 'Souper Cubes 2-cup')?.cavities).toBe(5)
  })
})
