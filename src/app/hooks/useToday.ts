import { useEffect, useState } from 'react'
import { today } from '@/domain/dates'

/** Today's date key, refreshed when the day rolls over while the app is open. */
export function useToday(): string {
  const [key, setKey] = useState(() => today())
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = today()
      setKey((k) => (k === t ? k : t))
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])
  return key
}
