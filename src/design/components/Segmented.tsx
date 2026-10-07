import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  description?: string
}

export interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  size?: 'md' | 'lg'
}

/** Radio group styled as a segmented control. Keyboard: arrow keys move, space/enter select. */
export function Segmented<T extends string>({ label, value, options, onChange, size = 'md' }: SegmentedProps<T>) {
  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`segmented-item ${selected ? 'is-selected' : ''}`}
            title={o.description}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                const i = options.findIndex((x) => x.value === value)
                onChange(options[(i + 1) % options.length]!.value)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                const i = options.findIndex((x) => x.value === value)
                onChange(options[(i - 1 + options.length) % options.length]!.value)
              }
            }}
            tabIndex={selected ? 0 : -1}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
