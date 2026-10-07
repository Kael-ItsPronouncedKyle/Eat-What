import { Route, Routes } from 'react-router'
import { HouseHome } from './HouseHome'
import { Members } from './Members'
import { RulesEditor } from './RulesEditor'
import { Retailers } from './Retailers'
import { Locations } from './Locations'
import { Containers } from './Containers'
import { Notifications } from './Notifications'
import { PriceCheck } from './PriceCheck'
import { Activity } from './Activity'
import { ExportData } from './ExportData'
import { ImportNeelix } from './ImportNeelix'
import { Display } from './Display'
import './house.css'

export function HousePage() {
  return (
    <Routes>
      <Route index element={<HouseHome />} />
      <Route path="members" element={<Members />} />
      <Route path="rules" element={<RulesEditor />} />
      <Route path="retailers" element={<Retailers />} />
      <Route path="locations" element={<Locations />} />
      <Route path="containers" element={<Containers />} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="prices" element={<PriceCheck />} />
      <Route path="activity" element={<Activity />} />
      <Route path="export" element={<ExportData />} />
      <Route path="import" element={<ImportNeelix />} />
      <Route path="display" element={<Display />} />
    </Routes>
  )
}
