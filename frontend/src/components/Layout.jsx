import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { Radio, Settings, Download, RefreshCw, Disc3, Circle, Square } from 'lucide-react'
import { useState } from 'react'
import { useJukebox } from '../context/JukeboxContext'
import { useRecording } from '../context/RecordingContext'

function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const { currentTrack } = useJukebox()
  const { isRecording, recordingData, stopRecording, forceStopRecording } = useRecording()
  const [showStopMenu, setShowStopMenu] = useState(false)
  
  // Add top padding when Jukebox bar is visible at top
  const hasJukeboxBar = !!currentTrack
  
  // Format elapsed time
  const formatElapsed = (seconds) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  const handleStopRecording = async (waitForTrack) => {
    setShowStopMenu(false)
    const result = waitForTrack 
      ? await stopRecording(true)
      : await forceStopRecording()
    if (!result.success) {
      alert(`Failed to stop recording: ${result.error}`)
    }
  }

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
              {/* Recording Indicator */}
              {isRecording && (
                <div className="relative">
                  <button
                    onClick={() => setShowStopMenu(!showStopMenu)}
                    className="flex items-center gap-2 px-3 py-2 bg-red-600/20 border border-red-500/50 rounded-lg hover:bg-red-600/30 transition-colors"
                  >
                    <Circle className="w-3 h-3 text-red-500 fill-red-500 animate-pulse" />
                    <span className="text-red-400 text-sm font-medium">REC</span>
                    <span className="text-red-300 text-sm">{formatElapsed(recordingData?.elapsedSeconds)}</span>
                  </button>
                  
                  {/* Stop Menu Dropdown */}
                  {showStopMenu && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                      <button
                        onClick={() => navigate(`/channel/${recordingData?.channelId}`)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 rounded-t-lg"
                      >
                        View Channel
                      </button>
                      <button
                        onClick={() => handleStopRecording(true)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Square className="w-3 h-3" />
                        Stop (Wait for Track)
                      </button>
                      <button
                        onClick={() => handleStopRecording(false)}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 rounded-b-lg flex items-center gap-2"
                      >
                        <Square className="w-3 h-3" />
                        Stop Now
                      </button>
                    </div>
                  )}
                </div>
              )}
              
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
