import { createBrowserRouter } from 'react-router'
import { Shell } from './Shell'
import { RouteError } from './RouteError'
import { HomePage } from '@/features/home/HomePage'
import { PantryPage } from '@/features/pantry/PantryPage'
import { CookPage } from '@/features/cook/CookPage'
import { ShopPage } from '@/features/shop/ShopPage'
import { HousePage } from '@/features/house/HousePage'
import { Join } from '@/features/auth/Join'
import { PrintLabels } from '@/features/print/PrintLabels'
import { PrintWeek } from '@/features/print/PrintWeek'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'pantry/*', element: <PantryPage /> },
      { path: 'cook/*', element: <CookPage /> },
      { path: 'shop/*', element: <ShopPage /> },
      { path: 'house/*', element: <HousePage /> },
      { path: 'join/:token', element: <Join /> },
    ],
  },
  // Print screens render without the shell: paper preview on screen, paper only when printed.
  { path: '/print/labels', element: <PrintLabels />, errorElement: <RouteError /> },
  { path: '/print/week/:id', element: <PrintWeek />, errorElement: <RouteError /> },
])
