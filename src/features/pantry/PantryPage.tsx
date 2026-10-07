import { Route, Routes } from 'react-router'
import { PantryList } from './PantryList'
import { ItemDetail } from './ItemDetail'
import { AddItem } from './AddItem'
import { FreezerShelf } from './FreezerShelf'
import { FreezerBlockDetail } from './FreezerBlockDetail'
import { ScanPlaceholder } from './ScanPlaceholder'
import './pantry.css'

export function PantryPage() {
  return (
    <Routes>
      <Route index element={<PantryList />} />
      <Route path="item/:id" element={<ItemDetail />} />
      <Route path="add" element={<AddItem />} />
      <Route path="scan" element={<ScanPlaceholder />} />
      <Route path="freezer" element={<FreezerShelf />} />
      <Route path="freezer/:id" element={<FreezerBlockDetail />} />
    </Routes>
  )
}
