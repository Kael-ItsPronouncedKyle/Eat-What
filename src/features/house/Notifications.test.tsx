import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithApp } from '@/test/render'
import { Notifications } from './Notifications'

describe('Notifications', () => {
  // Vitest runs without globals, so Testing Library does not unmount between tests on its own.
  afterEach(() => cleanup())

  it('shows the per-phone card with a plain status, then the per-kind toggles and quiet hours', async () => {
    await renderWithApp(<Notifications />, { route: '/house/notifications', path: '/house/*' })

    const phone = await screen.findByRole('switch', { name: /Notifications on this phone/ })
    expect(phone).toHaveAttribute('aria-checked', 'false')
    // jsdom has no PushManager, so the status reads as unsupported with the iPhone hint.
    expect(await screen.findByText(/Not supported in this browser/)).toBeInTheDocument()
    expect(screen.getByText(/Local mode saves this phone on the device only/)).toBeInTheDocument()

    expect(screen.getByRole('switch', { name: /Item hit Low or Out/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: /List sent by another member/ })).toBeInTheDocument()
    expect(screen.getByLabelText('From')).toBeInTheDocument()
  })

  it('a per-kind toggle stores a notification_prefs row for this user', async () => {
    const user = userEvent.setup()
    const { repo } = await renderWithApp(<Notifications />, { route: '/house/notifications', path: '/house/*' })
    const session = await repo.session()
    const denton = session.activeHouseholdId!

    const low = await screen.findByRole('switch', { name: /Item hit Low or Out/ })
    await user.click(low)
    expect(await screen.findByRole('switch', { name: /Item hit Low or Out/ })).toHaveAttribute('aria-checked', 'false')
    const prefs = await repo.table('notification_prefs').list(denton)
    expect(prefs.find((p) => p.type === 'low_out_daily' && p.userId === session.userId)?.enabled).toBe(false)
  })
})
