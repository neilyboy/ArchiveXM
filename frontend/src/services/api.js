import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Auth API
export const authApi = {
  login: (username, password) => 
    api.post('/api/auth/login', { username, password }),
  
  status: () => 
    api.get('/api/auth/status'),
  
  refresh: () => 
    api.post('/api/auth/refresh'),
  
  logout: () => 
    api.post('/api/auth/logout')
}

// Config API
export const configApi = {
  get: () => 
    api.get('/api/config'),
  
  update: (config) => 
    api.post('/api/config', config),
  
  setupStatus: () => 
    api.get('/api/config/setup-status'),
  
  setup: (data) => 
    api.post('/api/config/setup', data)
}

// Channels API
export const channelsApi = {
  getAll: (params = {}) => 
    api.get('/api/channels', { params }),
  
  get: (channelId) => 
    api.get(`/api/channels/${channelId}`),
  
  getCategories: () => 
    api.get('/api/channels/categories'),
  
  refresh: () => 
    api.post('/api/channels/refresh')
}

// Streams API
export const streamsApi = {
  getSchedule: (channelId, hoursBack = 5) => 
    api.get(`/api/streams/${channelId}/schedule`, { params: { hours_back: hoursBack } }),
  
  getNowPlaying: (channelId) => 
    api.get(`/api/streams/${channelId}/now-playing`),
  
  getStreamUrl: (channelId) => 
    api.get(`/api/streams/${channelId}/stream-url`),
  
  // Get proxy stream URL for HLS playback (bypasses CORS)
  getProxyStreamUrl: (channelId) => 
    `${API_URL}/api/streams/${channelId}/proxy-stream`
}

// Downloads API
export const downloadsApi = {
  downloadTrack: (track) => 
    api.post('/api/downloads/track', track),
  
  downloadBulk: (channelId, tracks) => 
    api.post('/api/downloads/bulk', { channel_id: channelId, tracks }),
  
  getHistory: (limit = 50, offset = 0) => 
    api.get('/api/downloads/history', { params: { limit, offset } }),
  
  getStatus: (downloadId) => 
    api.get(`/api/downloads/${downloadId}/status`)
}

export default api
