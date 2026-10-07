import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface Common {
  label: string
  hint?: ReactNode
  error?: string
}

export function TextField({ label, hint, error, className = '', ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id} className="field-label">{label}</label>
      <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={hint || error ? `${id}-hint` : undefined} {...rest} />
      {hint || error ? (
        <div id={`${id}-hint`} className={`field-hint small ${error ? 'field-error' : 'muted'}`}>{error ?? hint}</div>
      ) : null}
    </div>
  )
}

export function SelectField({ label, hint, error, className = '', children, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id} className="field-label">{label}</label>
      <select id={id} className="input" aria-invalid={error ? true : undefined} {...rest}>
        {children}
      </select>
      {hint || error ? <div className={`field-hint small ${error ? 'field-error' : 'muted'}`}>{error ?? hint}</div> : null}
    </div>
  )
}

export function TextArea({ label, hint, error, className = '', ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id} className="field-label">{label}</label>
      <textarea id={id} className="input textarea" aria-invalid={error ? true : undefined} {...rest} />
      {hint || error ? <div className={`field-hint small ${error ? 'field-error' : 'muted'}`}>{error ?? hint}</div> : null}
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId()
  return (
    <div className="toggle-row">
      <label htmlFor={id} className="grow">
        <span className="toggle-label">{label}</span>
        {hint ? <span className="muted small toggle-hint">{hint}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" aria-hidden="true" />
        <span className="visually-hidden">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}
