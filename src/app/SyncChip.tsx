import { useEffect, useState } from 'react'
import { useRepo } from '@/data/provider'
import type { SyncStatus } from '@/data/repository'
import { Icon } from '@/design/components'

/** Header chip: "3 waiting" while offline writes queue; a tap retries. Hidden when there is nothing to say. */
export function SyncChip() {
  const repo = useRepo()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  useEffect(() => {
    if (!repo.onSyncStatus) return
    return repo.onSyncStatus(setStatus)
  }, [repo])
  if (!status || (status.pending === 0 && status.online && !status.lastError)) return null
  const label = status.pending > 0 ? `${status.pending} ${status.pending === 1 ? 'change' : 'changes'} waiting` : status.online ? 'Sync problem' : 'Offline'
  return (
    <button type="button" className="btn btn-bar sync-chip" onClick={() => void repo.syncNow?.()} aria-label={`${label}. Tap to retry.`} title={status.lastError ?? label}>
      <Icon name={status.online ? 'upload' : 'alert'} size="1.2em" />
      <span className="small">{label}</span>
    </button>
  )
}
