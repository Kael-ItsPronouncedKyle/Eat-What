import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button, Icon } from '@/design/components'

/** Shell-less frame for a print screen: a 64px Print button, a Back link, optional options row, then the paper preview. */
export function PrintFrame({ title, backTo, backLabel, options, children }: { title: string; backTo: string; backLabel: string; options?: ReactNode; children: ReactNode }) {
  return (
    <div className="print-screen">
      <div className="print-toolbar">
        <Link to={backTo} className="print-back">
          <Icon name="chevronLeft" size="1.2em" /> {backLabel}
        </Link>
        <Button variant="primary" size="lg" icon="print" onClick={() => window.print()} aria-label={`Print ${title}`}>
          Print
        </Button>
      </div>
      {options ? <div className="print-options">{options}</div> : null}
      <main className="paper" aria-label={title}>
        {children}
      </main>
    </div>
  )
}
