import { useCallback, useState } from 'react'
import { Icon } from '@/design/components'
import { PartnerSheet } from './PartnerSheet'
import './partner.css'

/** Floating mic button on every screen. Tapping opens the partner sheet; it pulses while the mic is live.
    The sheet mounts only while open so its live queries do not run behind every page. */
export function PartnerButton() {
  const [open, setOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const close = useCallback(() => {
    setOpen(false)
    setListening(false)
  }, [])
  return (
    <>
      <div className="partner-fab">
        <button
          type="button"
          className={`btn ${listening ? 'is-listening' : ''}`}
          aria-label="Talk to Quartermaster"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Icon name="mic" size="1.8em" />
        </button>
      </div>
      {open ? <PartnerSheet open onClose={close} onListeningChange={setListening} /> : null}
    </>
  )
}
