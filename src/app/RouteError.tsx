import { isRouteErrorResponse, useRouteError, Link } from 'react-router'
import { EmptyState, Icon } from '@/design/components'

export function RouteError() {
  const err = useRouteError()
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : 'Something went wrong'
  return (
    <div className="page">
      <EmptyState
        icon="alert"
        title="That did not work"
        body={`${msg}. Go back to Home and try again.`}
        action={
          <Link to="/" className="btn btn-primary btn-lg">
            <Icon name="home" />
            <span className="btn-label">Home</span>
          </Link>
        }
      />
    </div>
  )
}
