import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import Hls from 'hls.js'
import { streamsApi } from '../services/api'
import { useJukebox } from './JukeboxContext'

const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const audioRef = useRef(null)
  const hlsRef = useRef(null)
  const isChangingChannel = useRef(false)  // Prevent race conditions
  
  // Get Jukebox context to pause it when starting live stream
  const jukebox = useJukebox()
  
  const [currentChannel, setCurrentChannel] = useState(null)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState(null)

  // Poll for current track info
  useEffect(() => {
    if (!currentChannel) return
    
    const fetchCurrentTrack = async () => {
      try {
        const response = await streamsApi.getSchedule(currentChannel.channel_id, 1)
        if (response?.data?.current_track) {
          setCurrentTrack(response.data.current_track)
        }
      } catch (e) {
        console.error('Failed to fetch current track:', e)
      }
    }
    
    fetchCurrentTrack()
    const interval = setInterval(fetchCurrentTrack, 15000) // Poll every 15 seconds
    
    return () => clearInterval(interval)
  }, [currentChannel])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
    }
  }, [])

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  // Register pause function with JukeboxContext so it can pause live stream
  useEffect(() => {
    if (jukebox?.registerPauseLiveStream) {
      const pauseLive = () => {
        // Check audio element directly to avoid stale closure
        if (audioRef.current && !audioRef.current.paused) {
          console.log('[Player] Pausing live stream for Jukebox')
          audioRef.current.pause()
          setIsPlaying(false)
        }
      }
      jukebox.registerPauseLiveStream(pauseLive)
    }
  }, [jukebox])

  const playChannel = useCallback(async (channel) => {
    if (!channel) return
    
    // Prevent race conditions - if already changing, ignore
    if (isChangingChannel.current) {
      console.log('[Player] Already changing channel, ignoring request')
      return
    }
    
    console.log('[Player] Starting playback for:', channel.name)
    isChangingChannel.current = true
    
    // Pause Jukebox when starting live stream
    if (jukebox?.isPlaying) {
      console.log('[Player] Pausing Jukebox for live stream')
      jukebox.pause()
    }
    
    try {
      // First, fully stop any existing playback
      if (hlsRef.current) {
        console.log('[Player] Destroying existing HLS instance')
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current.load() // Reset audio element
      }
      
      // Clear previous state
      setIsPlaying(false)
      setCurrentTrack(null)
      setError(null)
      
      // Small delay to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Now set loading and new channel
      setIsLoading(true)
      setCurrentChannel(channel)
      
      const streamUrl = streamsApi.getProxyStreamUrl(channel.channel_id)
      console.log('[Player] Stream URL:', streamUrl)
      
      // Make sure audio element exists
      if (!audioRef.current) {
        console.error('[Player] Audio element not available!')
        setError('Audio element not ready')
        setIsLoading(false)
        isChangingChannel.current = false
        return
      }
      
      if (Hls.isSupported()) {
        console.log('[Player] Using HLS.js')
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90
        })
        
        // Store reference immediately to track this instance
        hlsRef.current = hls
        
        hls.loadSource(streamUrl)
        hls.attachMedia(audioRef.current)
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          // Check if this HLS instance is still current (not replaced)
          if (hlsRef.current !== hls) {
            console.log('[Player] HLS instance replaced, ignoring')
            hls.destroy()
            return
          }
          
          console.log('[Player] Manifest parsed, starting playback')
          setIsLoading(false)
          isChangingChannel.current = false
          
          audioRef.current.play()
            .then(() => {
              console.log('[Player] Playback started successfully')
              setIsPlaying(true)
            })
            .catch(err => {
              console.error('[Player] Playback failed:', err)
              setError('Failed to start playback: ' + err.message)
            })
        })
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          // Check if this HLS instance is still current
          if (hlsRef.current !== hls) {
            return
          }
          
          console.error('HLS error:', data)
          if (data.fatal) {
            setIsLoading(false)
            isChangingChannel.current = false
            
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad()
                break
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError()
                break
              default:
                setError('Stream error occurred')
                hls.destroy()
                break
            }
          }
        })
      } else if (audioRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        audioRef.current.src = streamUrl
        audioRef.current.play()
          .then(() => {
            setIsLoading(false)
            setIsPlaying(true)
            isChangingChannel.current = false
          })
          .catch(err => {
            setIsLoading(false)
            setError('Failed to start playback')
            isChangingChannel.current = false
          })
      } else {
        setError('HLS not supported in this browser')
        setIsLoading(false)
        isChangingChannel.current = false
      }
    } catch (err) {
      console.error('[Player] Error in playChannel:', err)
      setError('Failed to start stream')
      setIsLoading(false)
      isChangingChannel.current = false
    }
  }, [jukebox])

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      // Pause Jukebox when resuming live stream
      if (jukebox?.isPlaying) {
        console.log('[Player] Pausing Jukebox for live stream resume')
        jukebox.pause()
      }
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(console.error)
    }
  }, [isPlaying, jukebox])

  const stop = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setIsPlaying(false)
    setCurrentChannel(null)
    setCurrentTrack(null)
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev)
  }, [])

  const value = {
    currentChannel,
    currentTrack,
    isPlaying,
    isLoading,
    volume,
    isMuted,
    error,
    playChannel,
    togglePlay,
    stop,
    setVolume,
    toggleMute
  }

  return (
    <PlayerContext.Provider value={value}>
      {/* Hidden audio element for HLS playback */}
      <audio ref={audioRef} style={{ display: 'none' }} />
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const context = useContext(PlayerContext)
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider')
  }
  return context
}
