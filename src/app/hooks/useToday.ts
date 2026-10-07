import { useEffect, useState } from 'react'
import { today } from '@/domain/dates'

/** Today's date key, refreshed when the day rolls over while the app is open. */
export function useToday(): string {
  const [key, setKey] = useState(() => today())
  useEffect(() => {
    const check = () => {
      const t = today()
      setKey((k) => (k === t ? k : t))
    }
    const id = window.setInterval(check, 60_000)
    // A phone that kept the app open overnight sees the new day on the first foreground, not up to a minute later.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return key
}
