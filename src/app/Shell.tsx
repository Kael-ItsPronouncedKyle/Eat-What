import { NavLink, Outlet, useLocation } from 'react-router'
import { Icon, IconButton, type IconName } from '@/design/components'
import { usePrefs } from './prefs'
import { useSession } from './session'
import { PartnerButton } from '@/features/partner/PartnerButton'
import { SyncChip } from './SyncChip'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/pantry', label: 'Pantry', icon: 'pantry' },
  { to: '/cook', label: 'Cook', icon: 'cook' },
  { to: '/shop', label: 'Shop', icon: 'shop' },
  { to: '/house', label: 'House', icon: 'house' },
]

/** App frame: dark opaque header and footer, content scrolls behind them, mic floats above both. */
export function Shell() {
  const { prefs, cycleTextSize } = usePrefs()
  const { household, households, switchHousehold } = useSession()
  const location = useLocation()
  const fullscreen = location.pathname.startsWith('/cook/mode')

  if (fullscreen) return <Outlet />

  return (
    <div className="shell" data-hand={prefs.hand}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar" role="banner">
        <div className="topbar-inner">
          <div className="brand">
            <Icon name="pantry" size="1.3em" />
            <span className="brand-name">Quartermaster</span>
          </div>
          <div className="topbar-actions">
            <SyncChip />
            {households.length > 1 ? (
              <label className="household-switch">
                <span className="visually-hidden">Active household</span>
                <select
                  value={household?.id ?? ''}
                  onChange={(e) => switchHousehold(e.target.value)}
                  className="household-select"
                  aria-label="Active household"
                >
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size="1em" className="household-caret" />
              </label>
            ) : (
              <span className="household-pill" aria-label="Active household">
                <Icon name="people" size="1em" />
                <span className="truncate">{household?.name ?? 'No household'}</span>
              </span>
            )}
            <button
              type="button"
              className="btn btn-bar text-size-btn"
              onClick={cycleTextSize}
              aria-label={`Text size ${prefs.textSize}. Tap to change.`}
              title="Text size"
            >
              <Icon name="textSize" size="1.3em" />
              <span className="text-size-label">{prefs.textSize}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="content" tabIndex={-1}>
        <Outlet />
      </main>

      <PartnerButton />

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `tab ${isActive ? 'is-active' : ''}`}>
            <Icon name={t.icon} size="1.5em" />
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function BackHeader({ title, to, right }: { title: string; to: string; right?: React.ReactNode }) {
  return (
    <div className="page-title">
      <div className="row">
        <NavLink to={to} className="btn btn-icon btn-ghost" aria-label="Back">
          <Icon name="chevronLeft" size="1.4em" />
        </NavLink>
        <h1>{title}</h1>
      </div>
      {right}
    </div>
  )
}

export { IconButton }
