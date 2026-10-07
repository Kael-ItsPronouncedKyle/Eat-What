import { useState } from 'react'
import { Icon, Sheet } from '@/design/components'

/** Floating mic button. Phase 1 ships the button and a text box; the intent parser lands in Phase 3. */
export function PartnerButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="partner-fab">
        <button type="button" className="btn" aria-label="Talk to Quartermaster" onClick={() => setOpen(true)}>
          <Icon name="mic" size="1.8em" />
        </button>
      </div>
      <Sheet open={open} title="Talk to QM" onClose={() => setOpen(false)} description="Say or type what changed. Nothing is sent or deleted without a tap.">
        <p className="muted">Voice intents arrive in Phase 3. For now, use the Pantry, Cook, and Shop tabs.</p>
      </Sheet>
    </>
  )
}
