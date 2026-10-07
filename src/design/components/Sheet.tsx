import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'

export interface SheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Footer slot: put the primary action here so it stays in the thumb zone. */
  footer?: ReactNode
  /** Describe the sheet for screen readers (optional). */
  description?: string
}

/** Bottom sheet built on <dialog>, so focus trapping, Escape, and inertness come from the platform. */
export function Sheet({ open, title, onClose, children, footer, description }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    d.addEventListener('cancel', onCancel)
    return () => d.removeEventListener('cancel', onCancel)
  }, [onClose])
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      aria-describedby={description ? `${titleId}-desc` : undefined}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="sheet-panel" role="document">
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-header">
          <h2 id={titleId} className="sheet-title">{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        {description ? <p id={`${titleId}-desc`} className="muted small sheet-desc">{description}</p> : null}
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-footer">{footer}</div> : null}
      </div>
    </dialog>
  )
}
