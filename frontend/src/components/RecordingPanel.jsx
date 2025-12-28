import { useState, useEffect } from 'react'
import { Circle, Square, Clock, Music } from 'lucide-react'
import { api } from '../services/api'

function RecordingPanel({ channelId, channelName }) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStatus, setRecordingStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkRecordingStatus()
    const interval = setInterval(checkRecordingStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const checkRecordingStatus = async () => {
    try {
      const response = await api.get('/api/recording/status')
      setRecordingStatus(response.data)
      setIsRecording(response.data.recording)
    } catch (error) {
      console.error('Error checking recording status:', error)
    }
  }

  const startRecording = async () => {
    setLoading(true)
    try {
      await api.post('/api/recording/start', { channel_id: channelId })
      setIsRecording(true)
      checkRecordingStatus()
    } catch (error) {
      console.error('Error starting recording:', error)
      alert(error.response?.data?.detail || 'Failed to start recording')
    } finally {
      setLoading(false)
    }
  }

  const stopRecording = async (waitForTrack = true) => {
    setLoading(true)
    try {
      const response = await api.post(`/api/recording/stop?wait_for_track=${waitForTrack}`)
      setIsRecording(false)
      setRecordingStatus(null)
      
      if (response.data.tracks_recorded > 0) {
        alert(`Recording complete! ${response.data.tracks_recorded} tracks saved.`)
      }
    } catch (error) {
      console.error('Error stopping recording:', error)
      alert(error.response?.data?.detail || 'Failed to stop recording')
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isRecordingThisChannel = isRecording && recordingStatus?.channel_id === channelId

  return (
    <div className="bg-sxm-darker rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
        <Circle className="w-4 h-4" />
        Live Recording
      </h3>

      {isRecordingThisChannel ? (
        <div>
          {/* Recording indicator */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white font-medium">Recording...</span>
            <span className="text-gray-400 text-sm">
              {formatDuration(recordingStatus?.elapsed_seconds || 0)}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
            <span className="flex items-center gap-1">
              <Music className="w-4 h-4" />
              {recordingStatus?.tracks_recorded || 0} tracks
            </span>
          </div>

          {/* Stop button */}
          <div className="flex gap-2">
            <button
              onClick={() => stopRecording(true)}
              disabled={loading}
              className="flex-1 bg-sxm-error hover:bg-red-600 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Square className="w-4 h-4 fill-current" />
              {loading ? 'Stopping...' : 'Stop (Wait for Track)'}
            </button>
            <button
              onClick={() => stopRecording(false)}
              disabled={loading}
              className="bg-sxm-card hover:bg-sxm-border text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              title="Stop immediately without waiting"
            >
              Stop Now
            </button>
          </div>
        </div>
      ) : isRecording ? (
        <div className="text-gray-400 text-sm">
          <p>Recording in progress on another channel.</p>
          <p className="text-xs mt-1">Stop that recording first to record here.</p>
        </div>
      ) : (
        <div>
          <p className="text-gray-400 text-sm mb-3">
            Record live audio with automatic track splitting and metadata.
          </p>
          <button
            onClick={startRecording}
            disabled={loading}
            className="w-full bg-sxm-error hover:bg-red-600 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Circle className="w-4 h-4 fill-current" />
            {loading ? 'Starting...' : 'Start Recording'}
          </button>
        </div>
      )}
    </div>
  )
}

export default RecordingPanel
