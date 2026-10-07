import type { HTMLAttributes, ReactNode } from 'react'

export type StatusTone = 'ok' | 'low' | 'out' | 'neutral' | 'accent'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Thin left status bar, the Ship's Stores card signature. */
  tone?: StatusTone
  padded?: boolean
  interactive?: boolean
  children: ReactNode
}

export function Card({ tone = 'neutral', padded = true, interactive, className = '', children, ...rest }: CardProps) {
  const cls = ['card', `card-${tone}`, padded ? 'card-padded' : '', interactive ? 'card-interactive' : '', className].filter(Boolean).join(' ')
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="card-header">
      <div className="grow">
        <div className="card-title">{title}</div>
        {subtitle ? <div className="card-subtitle muted small">{subtitle}</div> : null}
      </div>
      {right ? <div className="card-right">{right}</div> : null}
    </div>
  )
}
