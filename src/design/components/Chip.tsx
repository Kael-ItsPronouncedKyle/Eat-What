import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type StockStatus = 'ok' | 'low' | 'out'

const STATUS_LABEL: Record<StockStatus, string> = { ok: 'OK', low: 'Low', out: 'Out' }
const STATUS_ICON: Record<StockStatus, IconName> = { ok: 'check', low: 'alert', out: 'close' }

/** Status chip: text and icon always accompany the color (color is never the only signal). */
export function StatusChip({ status, size = 'md' }: { status: StockStatus; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`chip chip-status chip-${status} chip-${size}`}>
      <Icon name={STATUS_ICON[status]} size="1em" />
      <span>{STATUS_LABEL[status]}</span>
    </span>
  )
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  icon?: IconName
  tone?: 'neutral' | 'accent' | 'ok' | 'low' | 'out'
  children: ReactNode
}

/** Selectable chip (filters, location picker, mode toggles). Renders as a button with aria-pressed. */
export function Chip({ selected, icon, tone = 'neutral', className = '', children, type = 'button', ...rest }: ChipProps) {
  const cls = ['chip', 'chip-button', `chip-${tone}`, selected ? 'is-selected' : '', className].filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} aria-pressed={selected} {...rest}>
      {icon ? <Icon name={icon} size="1em" /> : null}
      <span>{children}</span>
    </button>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'low' | 'out' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
