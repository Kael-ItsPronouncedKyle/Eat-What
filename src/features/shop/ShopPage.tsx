import { Route, Routes } from 'react-router'
import { ShopList } from './ShopList'
import { Ordered } from './Ordered'
import { PriceBook } from './PriceBook'
import { Budget } from './Budget'
import './shop.css'

export function ShopPage() {
  return (
    <Routes>
      <Route index element={<ShopList />} />
      <Route path="ordered" element={<Ordered />} />
      <Route path="prices" element={<PriceBook />} />
      <Route path="budget" element={<Budget />} />
    </Routes>
  )
}
