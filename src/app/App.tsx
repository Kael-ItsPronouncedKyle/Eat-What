import { useEffect, useMemo, useState } from 'react'
import { RouterProvider } from 'react-router'
import { PrefsProvider } from './prefs'
import { UndoProvider } from '@/design/components'
import { RepositoryProvider } from '@/data/provider'
import { createRepository } from '@/data/createRepository'
import { ensureDemoSeed } from '@/data/seed/demo'
import { router } from './routes'
import { AuthGate } from '@/features/auth/AuthGate'
import { FirstRun } from '@/features/auth/FirstRun'

function Splash({ text }: { text: string }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash-mark" aria-hidden="true" />
      <p>{text}</p>
    </div>
  )
}

export default function App() {
  const repo = useMemo(() => createRepository(), [])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ensureDemoSeed(repo)
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [repo])

  if (error) return <Splash text={`Could not start: ${error}`} />
  if (!ready) return <Splash text="Setting up your stores" />

  return (
    <PrefsProvider>
      <UndoProvider>
        <AuthGate repo={repo}>
          <RepositoryProvider repo={repo} fallback={<Splash text="Loading" />} noHousehold={(reload) => <FirstRun onDone={reload} />}>
            <RouterProvider router={router} />
          </RepositoryProvider>
        </AuthGate>
      </UndoProvider>
    </PrefsProvider>
  )
}
