import { Outlet, Link, useLocation } from 'react-router-dom'
import { Radio, Settings, Download, RefreshCw, Disc3 } from 'lucide-react'
import { useState } from 'react'
import { useJukebox } from '../context/JukeboxContext'

function Layout() {
  const location = useLocation()
  const [refreshing, setRefreshing] = useState(false)
  const { currentTrack } = useJukebox()
  
  // Add top padding when Jukebox bar is visible at top
  const hasJukeboxBar = !!currentTrack

  return (
    <div className={`min-h-screen bg-sxm-dark ${hasJukeboxBar ? 'pt-14' : ''}`}>
      {/* Header */}
      <header className="bg-sxm-darker border-b border-sxm-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="ArchiveXM" className="w-10 h-10 rounded-lg" />
              <span className="text-xl font-bold text-white">ArchiveXM</span>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-2">
              <Link
                to="/"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === '/' 
                    ? 'bg-sxm-accent text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-sxm-card'
                }`}
              >
                <Radio size={18} />
                <span>Channels</span>
              </Link>
              <Link
                to="/jukebox"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === '/jukebox' 
                    ? 'bg-sxm-accent text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-sxm-card'
                }`}
              >
                <Disc3 size={18} />
                <span>Jukebox</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
