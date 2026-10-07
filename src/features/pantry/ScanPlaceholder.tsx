import { Link } from 'react-router'
import { BackHeader } from '@/app/Shell'
import { EmptyState } from '@/design/components'

export function ScanPlaceholder() {
  return (
    <div className="page">
      <BackHeader title="Scan" to="/pantry" />
      <EmptyState
        icon="camera"
        title="Barcode and receipt scanning arrive in Phase 3"
        body="For now, add items by name. Voice and camera intake come with the partner work."
        action={
          <Link to="/pantry/add" className="btn btn-primary btn-lg">
            Add by name
          </Link>
        }
      />
    </div>
  )
}
