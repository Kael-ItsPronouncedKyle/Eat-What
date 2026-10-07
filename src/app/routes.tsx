import { createBrowserRouter } from 'react-router'
import { Shell } from './Shell'
import { RouteError } from './RouteError'
import { HomePage } from '@/features/home/HomePage'
import { PantryPage } from '@/features/pantry/PantryPage'
import { CookPage } from '@/features/cook/CookPage'
import { ShopPage } from '@/features/shop/ShopPage'
import { HousePage } from '@/features/house/HousePage'

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
    ],
  },
])
