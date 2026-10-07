import { RouterProvider } from 'react-router'
import { PrefsProvider } from './prefs'
import { UndoProvider } from '@/design/components'
import { StaticSessionProvider } from './session'
import { router } from './routes'

const DEMO_SESSION = {
  userId: 'demo-user',
  household: { id: 'denton', name: 'Denton', role: 'owner' as const },
  households: [{ id: 'denton', name: 'Denton', role: 'owner' as const }],
  switchHousehold: () => {},
}

export default function App() {
  return (
    <PrefsProvider>
      <UndoProvider>
        <StaticSessionProvider value={DEMO_SESSION}>
          <RouterProvider router={router} />
        </StaticSessionProvider>
      </UndoProvider>
    </PrefsProvider>
  )
}
