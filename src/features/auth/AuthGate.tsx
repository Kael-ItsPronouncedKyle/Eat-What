import { useEffect, useState, type ReactNode } from 'react'
import type { Repository } from '@/data/repository'
import { getSupabaseClient } from '@/data/supabase/client'
import { SignIn } from './SignIn'
import { PENDING_INVITE_KEY, rememberPendingInvite } from './Join'

/** In Supabase mode, shows sign-in until a session exists. Local mode passes straight through. */
export function AuthGate({ repo, children }: { repo: Repository; children: ReactNode }) {
  const client = repo.mode === 'supabase' ? getSupabaseClient() : null
  const [signedIn, setSignedIn] = useState<boolean | null>(client ? null : true)

  useEffect(() => {
    if (!client) return
    let active = true
    client.auth.getSession().then(({ data }) => {
      if (!active) return
      setSignedIn(!!data.session)
      if (!data.session) rememberPendingInvite()
    })
    const { data: sub } = client.auth.onAuthStateChange((_e, session) => {
      if (!active) return
      setSignedIn(!!session)
      if (session) {
        try {
          const pending = localStorage.getItem(PENDING_INVITE_KEY)
          if (pending && !location.pathname.startsWith('/join/')) location.assign(`/join/${pending}`)
        } catch {
          /* ignore */
        }
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [client])

  if (signedIn === null) return <div className="splash" role="status"><div className="splash-mark" aria-hidden="true" /><p>Checking your sign-in</p></div>
  if (!signedIn && client) return <SignIn client={client} onSignedIn={() => setSignedIn(true)} />
  return <>{children}</>
}
