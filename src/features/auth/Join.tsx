import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useRepo } from '@/data/provider'
import { Button, Card, EmptyState } from '@/design/components'

/** /join/:token. Accepts a member or household invite for the signed-in user. */
export function Join() {
  const { token } = useParams()
  const repo = useRepo()
  const navigate = useNavigate()
  const [state, setState] = useState<'ready' | 'busy' | 'done' | 'error'>('ready')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    try {
      if (token) localStorage.removeItem(PENDING_INVITE_KEY)
    } catch {
      /* ignore */
    }
  }, [token])

  const accept = async () => {
    if (!token) return
    setState('busy')
    try {
      const h = await repo.acceptInvite(token)
      setMessage(`You are in ${h.name}.`)
      setState('done')
      setTimeout(() => navigate('/', { replace: true }), 800)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'That invite did not work.')
      setState('error')
    }
  }

  return (
    <div className="page">
      <Card>
        {state === 'done' ? (
          <EmptyState icon="check" title="Welcome" body={message ?? ''} />
        ) : state === 'error' ? (
          <EmptyState icon="alert" title="That invite did not work" body={message ?? 'Ask the owner for a new link.'} action={<Button variant="primary" onClick={() => navigate('/')}>Go home</Button>} />
        ) : (
          <EmptyState icon="people" title="Join a household" body="This link adds you to the household that sent it. You only see that household's data." action={<Button variant="primary" size="lg" loading={state === 'busy'} onClick={() => void accept()}>Accept the invite</Button>} />
        )}
      </Card>
    </div>
  )
}

export const PENDING_INVITE_KEY = 'qm.pendingInvite'

/** Remember an invite token seen while signed out, so it is applied after sign-in. */
export function rememberPendingInvite(): void {
  try {
    const m = /^\/join\/([A-Za-z0-9_-]+)/.exec(location.pathname)
    if (m) localStorage.setItem(PENDING_INVITE_KEY, m[1]!)
  } catch {
    /* ignore */
  }
}
