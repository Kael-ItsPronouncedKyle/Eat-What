import { BackHeader } from '@/app/Shell'
import { usePrefs, TEXT_SIZES, type Contrast, type FontChoice, type Hand, type Motion, type Theme } from '@/app/prefs'
import { Card, Segmented, Toggle } from '@/design/components'

/** Text size, theme, contrast, font, motion, handedness, read-aloud. Persisted per device now, per user with Supabase. */
export function Display() {
  const { prefs, set } = usePrefs()
  return (
    <div className="page">
      <BackHeader title="Display and access" to="/house" />
      <Card>
        <div className="pref-grid">
          <Segmented label="Text size" size="lg" value={prefs.textSize} onChange={(v) => set('textSize', v)} options={TEXT_SIZES.map((t) => ({ value: t, label: t, description: t === 'A' ? 'Standard' : t === 'A+' ? '1.3 times' : '1.6 times' }))} />
          <Segmented<Theme> label="Theme" value={prefs.theme} onChange={(v) => set('theme', v)} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          <Segmented<Contrast> label="Contrast" value={prefs.contrast} onChange={(v) => set('contrast', v)} options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]} />
          <Segmented<FontChoice> label="Font" value={prefs.font} onChange={(v) => set('font', v)} options={[{ value: 'default', label: 'Default' }, { value: 'reading', label: 'Easier reading' }]} />
          <Segmented<Motion> label="Motion" value={prefs.motion} onChange={(v) => set('motion', v)} options={[{ value: 'system', label: 'System' }, { value: 'reduced', label: 'Reduced' }]} />
          <Segmented<Hand> label="Main hand" value={prefs.hand} onChange={(v) => set('hand', v)} options={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }]} />
          <Toggle label="Read confirmations aloud" hint="Uses the device's own voice." checked={prefs.readAloud} onChange={(v) => set('readAloud', v)} />
        </div>
      </Card>
      <p className="muted small" style={{ marginTop: 'var(--space-4)' }}>
        Everything here also follows your phone's settings for dark mode and reduced motion unless you pick one.
      </p>
    </div>
  )
}
