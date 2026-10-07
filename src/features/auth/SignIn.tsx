import { useState } from 'react'
import type { QmSupabaseClient } from '@/data/supabase/client'
import { Button, Icon, TextField } from '@/design/components'
import './auth.css'

/** Email one-time code sign-in. No links (they open the browser, not the installed app), no passwords. Sign-ups are closed. */
export function SignIn({ client, onSignedIn }: { client: QmSupabaseClient; onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendCode = async () => {
    setBusy(true)
    setError(null)
    const { error: e } = await client.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } })
    setBusy(false)
    if (e) {
      setError(e.message.includes('Signups not allowed') || e.message.includes('not found') ? 'That email is not in this house yet. Ask the owner for an invite.' : e.message)
      return
    }
    setStage('code')
  }
  const verify = async () => {
    setBusy(true)
    setError(null)
    const { error: e } = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (e) {
      setError('That code did not work. Check the newest email, or send a new code.')
      return
    }
    onSignedIn()
  }

  return (
    <div className="auth">
      <form
        className="auth-card"
        onSubmit={(e) => {
          e.preventDefault()
          void (stage === 'email' ? sendCode() : verify())
        }}
      >
        <div className="auth-mark" aria-hidden="true"><Icon name="pantry" size="2em" /></div>
        <h1>Quartermaster</h1>
        {stage === 'email' ? (
          <>
            <p className="muted">Sign in with your email. We send a 6-digit code; no password to remember.</p>
            <TextField label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required error={error ?? undefined} />
            <Button type="submit" variant="primary" size="lg" full loading={busy} disabled={!email.includes('@')}>Send my code</Button>
          </>
        ) : (
          <>
            <p className="muted">We sent a code to <strong>{email}</strong>. Type it here.</p>
            <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} className="code-input" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required error={error ?? undefined} />
            <Button type="submit" variant="primary" size="lg" full loading={busy} disabled={code.trim().length < 6}>Sign in</Button>
            <Button variant="ghost" onClick={() => { setStage('email'); setCode('') }}>Use a different email</Button>
          </>
        )}
      </form>
    </div>
  )
}
