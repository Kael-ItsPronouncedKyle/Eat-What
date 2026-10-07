import { render, waitFor, type RenderOptions } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ReactElement, ReactNode } from 'react'
import { PrefsProvider } from '@/app/prefs'
import { UndoProvider } from '@/design/components'
import { RepositoryProvider } from '@/data/provider'
import { LocalRepository } from '@/data/local/LocalRepository'
import { QmDatabase } from '@/data/local/db'
import { ensureDemoSeed } from '@/data/seed/demo'

let dbCounter = 0

/** A fresh seeded local repository per test (fake-indexeddb). Denton is the active household. */
export async function seededRepo(): Promise<LocalRepository> {
  const repo = new LocalRepository({ db: new QmDatabase(`feature-test-${++dbCounter}-${Date.now()}`) })
  await ensureDemoSeed(repo)
  return repo
}

export interface RenderAppOptions extends Omit<RenderOptions, 'wrapper'> {
  repo?: LocalRepository
  /** Initial URL, e.g. '/pantry'. */
  route?: string
  /** Path pattern the element is mounted at, e.g. '/pantry/*'. Defaults to '*'. */
  path?: string
}

/** Render a feature page with every provider the app uses. Resolves once the repository session has loaded. */
export async function renderWithApp(ui: ReactElement, opts: RenderAppOptions = {}) {
  const repo = opts.repo ?? (await seededRepo())
  const route = opts.route ?? '/'
  const path = opts.path ?? '*'
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <PrefsProvider>
      <UndoProvider>
        <RepositoryProvider repo={repo} fallback={<div data-testid="loading">Loading</div>}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={children} />
            </Routes>
          </MemoryRouter>
        </RepositoryProvider>
      </UndoProvider>
    </PrefsProvider>
  )
  const result = render(ui, { ...opts, wrapper: Wrapper })
  await waitFor(() => {
    if (result.queryByTestId('loading')) throw new Error('still loading')
  }, { timeout: 5000 })
  return { ...result, repo }
}
