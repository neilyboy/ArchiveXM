import { useState } from 'react'
import { Radio, Lock, User, FolderOpen, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { configApi } from '../services/api'

function SetupPage({ onComplete }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  })
  
  const [downloadPath, setDownloadPath] = useState('/downloads')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await configApi.setup({
        username: credentials.username,
        password: credentials.password,
        download_path: downloadPath
      })

      if (response.data.success) {
        setStep(3) // Success step
        setTimeout(() => {
          onComplete()
        }, 2000)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Setup failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-sxm-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="ArchiveXM" className="w-24 h-24 mx-auto mb-4 rounded-2xl shadow-2xl" />
          <h1 className="text-3xl font-bold text-white mb-2">ArchiveXM</h1>
          <p className="text-gray-400">SiriusXM streaming & archival</p>
        </div>

        {/* Setup Card */}
        <div className="card">
          {step === 3 ? (
            // Success State
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-sxm-success mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Setup Complete!</h2>
              <p className="text-gray-400">Redirecting to channels...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Progress Steps */}
              <div className="flex items-center justify-center gap-2 mb-8">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= 1 ? 'bg-sxm-accent text-white' : 'bg-sxm-border text-gray-500'
                }`}>
                  1
                </div>
                <div className={`w-12 h-1 rounded ${step >= 2 ? 'bg-sxm-accent' : 'bg-sxm-border'}`}></div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= 2 ? 'bg-sxm-accent text-white' : 'bg-sxm-border text-gray-500'
                }`}>
                  2
                </div>
              </div>

              {step === 1 && (
                <>
                  <h2 className="text-xl font-bold text-white mb-6 text-center">
                    SiriusXM Credentials
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Username / Email</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                          type="text"
                          className="input pl-10"
                          placeholder="your@email.com"
                          value={credentials.username}
                          onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                          type="password"
                          className="input pl-10"
                          placeholder="••••••••"
                          value={credentials.password}
                          onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!credentials.username || !credentials.password}
                    className="btn-primary w-full mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </>
              )}

              {step === 2 && (
                <>
                  <h2 className="text-xl font-bold text-white mb-6 text-center">
                    Download Location
                  </h2>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Save files to</label>
                    <div className="relative">
                      <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="text"
                        className="input pl-10"
                        placeholder="/downloads"
                        value={downloadPath}
                        onChange={(e) => setDownloadPath(e.target.value)}
                        required
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Inside Docker, use /downloads (mounted to your host)
                    </p>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sxm-error bg-sxm-error/10 rounded-lg p-3 mt-4">
                      <AlertCircle size={18} />
                      <span className="text-sm">{error}</span>
                    </div>
                  )}

                  <div className="flex gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="btn-secondary flex-1"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !downloadPath}
                      className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Complete Setup'
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-sm mt-6">
          Your credentials are stored locally and encrypted
        </p>
      </div>
    </div>
  )
}

export default SetupPage
