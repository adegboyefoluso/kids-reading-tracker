import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import KioskView from './views/KioskView'
import ScannerView from './views/ScannerView'
import AdminView from './views/AdminView'
import SetupView from './views/SetupView'
import AnalyticsView from './views/AnalyticsView'
import BuddyView from './views/BuddyView'
import TestView from './views/TestView'
import WorksheetView from './views/WorksheetView'
import ChoresView from './views/ChoresView'
import LeaderboardView from './views/LeaderboardView'

export default function App() {
  useEffect(() => {
    // Apply saved color mode on every page load before first paint
    const mode = localStorage.getItem('colorMode') || 'dark'
    document.documentElement.classList.toggle('light-mode', mode === 'light')
  }, [])

  // When a new service worker takes control, reload immediately so the
  // user always runs the latest code rather than stale cached JS.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let reloading = false
    const onControllerChange = () => {
      if (!reloading) { reloading = true; window.location.reload() }
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScannerView />} />
        <Route path="/scan" element={<Navigate to="/" replace />} />
        <Route path="/kiosk" element={<KioskView />} />
        <Route path="/admin" element={<AdminView />} />
        <Route path="/analytics" element={<AnalyticsView />} />
        <Route path="/setup" element={<SetupView />} />
        <Route path="/buddy" element={<BuddyView />} />
        <Route path="/test" element={<TestView />} />
        <Route path="/worksheet" element={<WorksheetView />} />
        <Route path="/chores" element={<ChoresView />} />
        <Route path="/leaderboard" element={<LeaderboardView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
