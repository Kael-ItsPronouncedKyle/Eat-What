import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ok' | 'low' | 'out'
export type ButtonSize = 'md' | 'lg' | 'sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  iconRight?: IconName
  full?: boolean
  loading?: boolean
  children?: ReactNode
}

/** Minimum tap target is 48px; `size="lg"` is the 64px primary action height from the spec. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, full, loading, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = ['btn', `btn-${variant}`, `btn-${size}`, full ? 'btn-full' : '', loading ? 'is-loading' : '', className].filter(Boolean).join(' ')
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children ? <span className="btn-label">{children}</span> : null}
      {iconRight ? <Icon name={iconRight} /> : null}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  size?: ButtonSize
  variant?: ButtonVariant | 'bar'
  active?: boolean
}

/** Icon only button with a required accessible label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'md', variant = 'ghost', active, className = '', type = 'button', ...rest },
  ref,
) {
  const cls = ['btn', 'btn-icon', `btn-${variant}`, `btn-${size}`, active ? 'is-active' : '', className].filter(Boolean).join(' ')
  return (
    <button ref={ref} type={type} className={cls} aria-label={label} title={label} aria-pressed={active} {...rest}>
      <Icon name={icon} size="1.4em" />
    </button>
  )
})
