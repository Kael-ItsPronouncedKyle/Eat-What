import { useEffect, useState } from 'react'
import { IconButton } from './Button'

export interface StepperProps {
  label: string
  value: number
  unit?: string
  step?: number
  min?: number
  onChange: (next: number) => void
  size?: 'md' | 'lg'
}

/** Count stepper with 48px targets. Value is editable by typing as well as tapping. */
export function Stepper({ label, value, unit, step = 1, min = 0, onChange, size = 'md' }: StepperProps) {
  const dec = () => onChange(Math.max(min, round(value - step)))
  const inc = () => onChange(round(value + step))
  const display = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
  const [text, setText] = useState(display)
  useEffect(() => setText(display), [display])
  const commit = () => {
    const n = Number(text)
    if (text.trim() === '' || Number.isNaN(n)) return setText(display)
    const next = Math.max(min, round(n))
    if (next !== value) onChange(next)
    else setText(display)
  }
  return (
    <div className={`stepper stepper-${size}`} role="group" aria-label={label}>
      <IconButton icon="minus" label={`Decrease ${label}`} variant="secondary" size={size} onClick={dec} disabled={value <= min} />
      <label className="stepper-value">
        <span className="visually-hidden">{label}</span>
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          className="stepper-input num"
          aria-label={`${label} amount`}
        />
        {unit ? <span className="stepper-unit muted small">{unit}</span> : null}
      </label>
      <IconButton icon="plus" label={`Increase ${label}`} variant="secondary" size={size} onClick={inc} />
    </div>
  )
}

function round(n: number) {
  return Math.round(n * 100) / 100
}
