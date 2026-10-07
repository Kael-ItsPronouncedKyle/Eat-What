import type { ReactNode } from 'react'
import { Icon } from './Icon'

export interface ListRowProps {
  title: ReactNode
  subtitle?: ReactNode
  left?: ReactNode
  right?: ReactNode
  onClick?: () => void
  href?: string
  chevron?: boolean
  tone?: 'ok' | 'low' | 'out' | 'neutral'
}

/** A 48px+ tall row used in lists. Becomes a button when onClick is set. */
export function ListRow({ title, subtitle, left, right, onClick, chevron, tone = 'neutral' }: ListRowProps) {
  const inner = (
    <>
      {left ? <div className="row-left">{left}</div> : null}
      <div className="grow row-main">
        <div className="row-title">{title}</div>
        {subtitle ? <div className="row-subtitle muted small">{subtitle}</div> : null}
      </div>
      {right ? <div className="row-right">{right}</div> : null}
      {chevron ? <Icon name="chevronRight" className="row-chevron muted" /> : null}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={`list-row list-row-button tone-${tone}`} onClick={onClick}>
        {inner}
      </button>
    )
  }
  return <div className={`list-row tone-${tone}`}>{inner}</div>
}
