import { useState, useEffect, useRef } from 'react'
import { 
  Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, List, Plus, Search, RefreshCw, Disc3,
  MoreVertical, Trash2, ListPlus, X, ChevronLeft, ChevronRight,
  Clock, Library, User, Album, Loader2
} from 'lucide-react'
import { libraryApi } from '../services/api'

function JukeboxPage() {
  // Library state
  const [tracks, setTracks] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [artists, setArtists] = useState([])
  const [albums, setAlbums] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeView, setActiveView] = useState('tracks') // tracks, artists, albums, playlists
  const [selectedPlaylist, setSelectedPlaylist] = useState(null)
  
  // Player state
  const audioRef = useRef(null)
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState('none') // none, all, one
  const [showQueue, setShowQueue] = useState(false)
  
  // Playlist modal
  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [trackToAdd, setTrackToAdd] = useState(null)

  const currentTrack = queue[currentIndex] || null

  useEffect(() => {
    loadLibrary()
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  const loadLibrary = async () => {
    setLoading(true)
    try {
      const [tracksRes, playlistsRes, statsRes] = await Promise.all([
        libraryApi.getTracks({ limit: 500 }),
        libraryApi.getPlaylists(),
        libraryApi.getStats()
      ])
      setTracks(tracksRes.data || [])
      setPlaylists(playlistsRes.data || [])
      setStats(statsRes.data)
    } catch (error) {
      console.error('Error loading library:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadArtists = async () => {
    try {
      const res = await libraryApi.getArtists()
      setArtists(res.data || [])
    } catch (error) {
      console.error('Error loading artists:', error)
    }
  }

  const loadAlbums = async () => {
    try {
      const res = await libraryApi.getAlbums()
      setAlbums(res.data || [])
    } catch (error) {
      console.error('Error loading albums:', error)
    }
  }

  const scanLibrary = async () => {
    setScanning(true)
    try {
      await libraryApi.scan()
      await loadLibrary()
    } catch (error) {
      console.error('Error scanning library:', error)
    } finally {
      setScanning(false)
    }
  }

  // Player controls
  const playTrack = (track, index = -1, trackList = null) => {
    if (trackList) {
      setQueue(trackList)
      setCurrentIndex(index >= 0 ? index : trackList.findIndex(t => t.id === track.id))
    } else if (index < 0) {
      // Add to queue and play
      const newQueue = [...queue, track]
      setQueue(newQueue)
      setCurrentIndex(newQueue.length - 1)
    }
    
    if (audioRef.current) {
      audioRef.current.src = libraryApi.getStreamUrl(track.id)
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const playNext = () => {
    if (queue.length === 0) return
    
    let nextIndex
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length)
    } else {
      nextIndex = currentIndex + 1
      if (nextIndex >= queue.length) {
        if (repeat === 'all') {
          nextIndex = 0
        } else {
          return
        }
      }
    }
    
    setCurrentIndex(nextIndex)
    if (audioRef.current) {
      audioRef.current.src = libraryApi.getStreamUrl(queue[nextIndex].id)
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const playPrevious = () => {
    if (queue.length === 0) return
    
    // If more than 3 seconds into track, restart it
    if (currentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }
    
    let prevIndex = currentIndex - 1
    if (prevIndex < 0) {
      if (repeat === 'all') {
        prevIndex = queue.length - 1
      } else {
        prevIndex = 0
      }
    }
    
    setCurrentIndex(prevIndex)
    if (audioRef.current) {
      audioRef.current.src = libraryApi.getStreamUrl(queue[prevIndex].id)
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    if (repeat === 'one') {
      audioRef.current.currentTime = 0
      audioRef.current.play()
    } else {
      playNext()
    }
  }

  const handleSeek = (e) => {
    const value = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = value
      setCurrentTime(value)
    }
  }

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Queue management
  const addToQueue = (track) => {
    setQueue([...queue, track])
  }

  const removeFromQueue = (index) => {
    const newQueue = queue.filter((_, i) => i !== index)
    setQueue(newQueue)
    if (index < currentIndex) {
      setCurrentIndex(currentIndex - 1)
    } else if (index === currentIndex) {
      // Current track removed, play next
      if (newQueue.length > 0) {
        const newIndex = Math.min(index, newQueue.length - 1)
        setCurrentIndex(newIndex)
        audioRef.current.src = libraryApi.getStreamUrl(newQueue[newIndex].id)
        audioRef.current.play()
      } else {
        setCurrentIndex(-1)
        setIsPlaying(false)
      }
    }
  }

  const clearQueue = () => {
    setQueue([])
    setCurrentIndex(-1)
    setIsPlaying(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
  }

  const playAll = () => {
    const filteredTracks = getFilteredTracks()
    if (filteredTracks.length > 0) {
      setQueue(filteredTracks)
      setCurrentIndex(0)
      if (audioRef.current) {
        audioRef.current.src = libraryApi.getStreamUrl(filteredTracks[0].id)
        audioRef.current.play()
        setIsPlaying(true)
      }
    }
  }

  const shuffleAll = () => {
    const filteredTracks = getFilteredTracks()
    if (filteredTracks.length > 0) {
      const shuffled = [...filteredTracks].sort(() => Math.random() - 0.5)
      setQueue(shuffled)
      setCurrentIndex(0)
      setShuffle(true)
      if (audioRef.current) {
        audioRef.current.src = libraryApi.getStreamUrl(shuffled[0].id)
        audioRef.current.play()
        setIsPlaying(true)
      }
    }
  }

  // Playlist management
  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return
    
    try {
      await libraryApi.createPlaylist(newPlaylistName)
      setNewPlaylistName('')
      setShowPlaylistModal(false)
      const res = await libraryApi.getPlaylists()
      setPlaylists(res.data || [])
    } catch (error) {
      console.error('Error creating playlist:', error)
    }
  }

  const addTrackToPlaylist = async (playlistId) => {
    if (!trackToAdd) return
    
    try {
      await libraryApi.addToPlaylist(playlistId, [trackToAdd.id])
      setTrackToAdd(null)
      // Refresh playlists
      const res = await libraryApi.getPlaylists()
      setPlaylists(res.data || [])
    } catch (error) {
      console.error('Error adding to playlist:', error)
    }
  }

  const loadPlaylist = async (playlist) => {
    try {
      const res = await libraryApi.getPlaylist(playlist.id)
      setSelectedPlaylist(res.data)
      setActiveView('playlist')
    } catch (error) {
      console.error('Error loading playlist:', error)
    }
  }

  const playPlaylist = (playlist) => {
    if (playlist.tracks && playlist.tracks.length > 0) {
      const playlistTracks = playlist.tracks.map(pt => pt.track)
      setQueue(playlistTracks)
      setCurrentIndex(0)
      if (audioRef.current) {
        audioRef.current.src = libraryApi.getStreamUrl(playlistTracks[0].id)
        audioRef.current.play()
        setIsPlaying(true)
      }
    }
  }

  const getFilteredTracks = () => {
    if (!searchQuery) return tracks
    const query = searchQuery.toLowerCase()
    return tracks.filter(t => 
      t.title?.toLowerCase().includes(query) ||
      t.artist?.toLowerCase().includes(query) ||
      t.album?.toLowerCase().includes(query)
    )
  }

  const filteredTracks = getFilteredTracks()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
          {/* Logo/Title */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Disc3 className="w-8 h-8 text-primary" />
              <span className="text-xl font-bold text-white">Jukebox</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-2 space-y-1">
            <button
              onClick={() => setActiveView('tracks')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                activeView === 'tracks' ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Music className="w-5 h-5" />
              <span>All Tracks</span>
            </button>
            <button
              onClick={() => { setActiveView('artists'); loadArtists() }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                activeView === 'artists' ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <User className="w-5 h-5" />
              <span>Artists</span>
            </button>
            <button
              onClick={() => { setActiveView('albums'); loadAlbums() }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                activeView === 'albums' ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Album className="w-5 h-5" />
              <span>Albums</span>
            </button>
          </nav>

          {/* Playlists */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium text-gray-400">Playlists</span>
              <button
                onClick={() => setShowPlaylistModal(true)}
                className="text-gray-400 hover:text-white"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              {playlists.map(playlist => (
                <button
                  key={playlist.id}
                  onClick={() => loadPlaylist(playlist)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    selectedPlaylist?.id === playlist.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <List className="w-4 h-4" />
                  <span className="truncate">{playlist.name}</span>
                  <span className="text-xs text-gray-500 ml-auto">{playlist.track_count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="p-4 border-t border-gray-800 text-xs text-gray-500">
              <div>{stats.total_tracks} tracks</div>
              <div>{stats.unique_artists} artists</div>
            </div>
          )}
        </div>

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-800 flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder="Search tracks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={scanLibrary}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Scanning...' : 'Scan Library'}</span>
            </button>
            <button
              onClick={playAll}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
              <span>Play All</span>
            </button>
            <button
              onClick={shuffleAll}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <Shuffle className="w-4 h-4" />
              <span>Shuffle</span>
            </button>
          </div>

          {/* Track List */}
          <div className="flex-1 overflow-y-auto">
            {activeView === 'tracks' && (
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-900 text-left text-sm text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Artist</th>
                    <th className="px-4 py-3">Album</th>
                    <th className="px-4 py-3 w-20">
                      <Clock className="w-4 h-4" />
                    </th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTracks.map((track, index) => (
                    <tr
                      key={track.id}
                      className={`hover:bg-gray-800/50 transition-colors cursor-pointer ${
                        currentTrack?.id === track.id ? 'bg-primary/20' : ''
                      }`}
                      onDoubleClick={() => playTrack(track, index, filteredTracks)}
                    >
                      <td className="px-4 py-3 text-gray-500">
                        {currentTrack?.id === track.id && isPlaying ? (
                          <div className="flex items-center gap-0.5">
                            <span className="w-1 h-3 bg-primary rounded-full animate-pulse"></span>
                            <span className="w-1 h-4 bg-primary rounded-full animate-pulse delay-75"></span>
                            <span className="w-1 h-2 bg-primary rounded-full animate-pulse delay-150"></span>
                          </div>
                        ) : (
                          index + 1
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-800 rounded flex items-center justify-center flex-shrink-0">
                            <Music className="w-5 h-5 text-gray-600" />
                          </div>
                          <span className="text-white font-medium truncate">
                            {track.title || track.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 truncate">{track.artist || 'Unknown'}</td>
                      <td className="px-4 py-3 text-gray-400 truncate">{track.album || '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatTime(track.duration_seconds)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); addToQueue(track) }}
                            className="text-gray-500 hover:text-white"
                            title="Add to queue"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setTrackToAdd(track) }}
                            className="text-gray-500 hover:text-white"
                            title="Add to playlist"
                          >
                            <ListPlus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeView === 'artists' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4">
                {artists.map(artist => (
                  <button
                    key={artist.name}
                    onClick={() => setSearchQuery(artist.name)}
                    className="bg-gray-800/50 hover:bg-gray-800 rounded-lg p-4 text-left transition-colors"
                  >
                    <div className="w-full aspect-square bg-gray-700 rounded-full flex items-center justify-center mb-3">
                      <User className="w-12 h-12 text-gray-500" />
                    </div>
                    <h3 className="text-white font-medium truncate">{artist.name}</h3>
                    <p className="text-gray-500 text-sm">{artist.track_count} tracks</p>
                  </button>
                ))}
              </div>
            )}

            {activeView === 'albums' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4">
                {albums.map(album => (
                  <button
                    key={`${album.name}-${album.artist}`}
                    onClick={() => setSearchQuery(album.name)}
                    className="bg-gray-800/50 hover:bg-gray-800 rounded-lg p-4 text-left transition-colors"
                  >
                    <div className="w-full aspect-square bg-gray-700 rounded flex items-center justify-center mb-3">
                      <Album className="w-12 h-12 text-gray-500" />
                    </div>
                    <h3 className="text-white font-medium truncate">{album.name}</h3>
                    <p className="text-gray-500 text-sm truncate">{album.artist}</p>
                    <p className="text-gray-600 text-xs">{album.track_count} tracks</p>
                  </button>
                ))}
              </div>
            )}

            {activeView === 'playlist' && selectedPlaylist && (
              <div className="p-4">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-32 h-32 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
                    <List className="w-12 h-12 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedPlaylist.name}</h2>
                    <p className="text-gray-400">{selectedPlaylist.track_count} tracks</p>
                    <button
                      onClick={() => playPlaylist(selectedPlaylist)}
                      className="mt-2 flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-full transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      <span>Play</span>
                    </button>
                  </div>
                </div>
                <table className="w-full">
                  <thead className="text-left text-sm text-gray-400 border-b border-gray-800">
                    <tr>
                      <th className="px-4 py-3 w-12">#</th>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Artist</th>
                      <th className="px-4 py-3 w-20">
                        <Clock className="w-4 h-4" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPlaylist.tracks?.map((pt, index) => (
                      <tr
                        key={pt.track.id}
                        className="hover:bg-gray-800/50 transition-colors cursor-pointer"
                        onDoubleClick={() => {
                          const playlistTracks = selectedPlaylist.tracks.map(p => p.track)
                          playTrack(pt.track, index, playlistTracks)
                        }}
                      >
                        <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                        <td className="px-4 py-3 text-white">{pt.track.title || pt.track.filename}</td>
                        <td className="px-4 py-3 text-gray-400">{pt.track.artist || 'Unknown'}</td>
                        <td className="px-4 py-3 text-gray-500">{formatTime(pt.track.duration_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Queue Panel */}
        {showQueue && (
          <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-medium text-white">Queue</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearQueue}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowQueue(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {queue.map((track, index) => (
                <div
                  key={`${track.id}-${index}`}
                  className={`flex items-center gap-3 p-3 hover:bg-gray-800 ${
                    index === currentIndex ? 'bg-primary/20' : ''
                  }`}
                >
                  <span className="text-gray-500 text-sm w-6">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{track.title || track.filename}</p>
                    <p className="text-gray-500 text-xs truncate">{track.artist || 'Unknown'}</p>
                  </div>
                  <button
                    onClick={() => removeFromQueue(index)}
                    className="text-gray-500 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Player Bar */}
      <div className="bg-gray-900 border-t border-gray-800 px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Track Info */}
          <div className="flex items-center gap-3 w-64">
            {currentTrack ? (
              <>
                <div className="w-14 h-14 bg-gray-800 rounded flex items-center justify-center flex-shrink-0">
                  <Music className="w-6 h-6 text-gray-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{currentTrack.title || currentTrack.filename}</p>
                  <p className="text-gray-400 text-sm truncate">{currentTrack.artist || 'Unknown'}</p>
                </div>
              </>
            ) : (
              <p className="text-gray-500">No track playing</p>
            )}
          </div>

          {/* Center Controls */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShuffle(!shuffle)}
                className={`transition-colors ${shuffle ? 'text-primary' : 'text-gray-400 hover:text-white'}`}
              >
                <Shuffle className="w-5 h-5" />
              </button>
              <button
                onClick={playPrevious}
                className="text-gray-400 hover:text-white"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={togglePlay}
                disabled={!currentTrack}
                className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button
                onClick={playNext}
                className="text-gray-400 hover:text-white"
              >
                <SkipForward className="w-5 h-5" />
              </button>
              <button
                onClick={() => setRepeat(repeat === 'none' ? 'all' : repeat === 'all' ? 'one' : 'none')}
                className={`transition-colors ${repeat !== 'none' ? 'text-primary' : 'text-gray-400 hover:text-white'}`}
              >
                <Repeat className="w-5 h-5" />
                {repeat === 'one' && <span className="text-xs">1</span>}
              </button>
            </div>
            
            {/* Progress Bar */}
            <div className="flex items-center gap-2 w-full max-w-xl">
              <span className="text-xs text-gray-500 w-10 text-right">{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-3
                  [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-xs text-gray-500 w-10">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-4 w-64 justify-end">
            <button
              onClick={() => setShowQueue(!showQueue)}
              className={`transition-colors ${showQueue ? 'text-primary' : 'text-gray-400 hover:text-white'}`}
            >
              <List className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="text-gray-400 hover:text-white"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-24 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white
                [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Create Playlist Modal */}
      {showPlaylistModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-96">
            <h3 className="text-xl font-bold text-white mb-4">Create Playlist</h3>
            <input
              type="text"
              placeholder="Playlist name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white mb-4 focus:outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPlaylistModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={createPlaylist}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Playlist Modal */}
      {trackToAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-96">
            <h3 className="text-xl font-bold text-white mb-2">Add to Playlist</h3>
            <p className="text-gray-400 text-sm mb-4 truncate">{trackToAdd.title || trackToAdd.filename}</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {playlists.map(playlist => (
                <button
                  key={playlist.id}
                  onClick={() => addTrackToPlaylist(playlist.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left"
                >
                  <List className="w-5 h-5 text-gray-500" />
                  <span className="text-white">{playlist.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setTrackToAdd(null)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default JukeboxPage
