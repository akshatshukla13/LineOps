import { useMemo, useState } from 'react'
import { GoogleLogin, googleLogout } from '@react-oauth/google'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'

const STORAGE_KEY = 'rgpv_google_user'

const loadStoredUser = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    return null
  }
}

function App() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => loadStoredUser())
  const [authError, setAuthError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const apiBaseUrl = useMemo(() => {
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  }, [])

  const handleLoginSuccess = async (credentialResponse) => {
    setIsLoading(true)
    setAuthError('')

    try {
      if (!credentialResponse?.credential) {
        throw new Error('Missing credential from Google.')
      }

      const response = await fetch(`${apiBaseUrl}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Authentication failed.')
      }

      const data = await response.json()
      setUser(data.user)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user))
      navigate('/profile')
    } catch (error) {
      setAuthError(error.message || 'Authentication failed.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoginError = () => {
    setAuthError('Google login was canceled or failed.')
  }

  const handleLogout = () => {
    googleLogout()
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
    navigate('/')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-dot" />
          <span>RGPV OAuth Demo</span>
        </div>
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/profile">Profile</Link>
        </nav>
        {user ? (
          <button className="ghost" onClick={handleLogout}>
            Sign out
          </button>
        ) : null}
      </header>

      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              <section className="card hero">
                <h1>Sign in with Google</h1>
                <p>Authenticate and view your Google profile details.</p>

                {user ? (
                  <div className="inline-actions">
                    <Link className="primary" to="/profile">
                      View profile
                    </Link>
                  </div>
                ) : (
                  <div className="inline-actions">
                    <GoogleLogin
                      onSuccess={handleLoginSuccess}
                      onError={handleLoginError}
                    />
                  </div>
                )}

                {isLoading ? <p className="status">Signing you in...</p> : null}
                {authError ? <p className="error">{authError}</p> : null}
              </section>
            }
          />
          <Route
            path="/profile"
            element={
              <section className="card profile">
                <h1>Your profile</h1>
                {!user ? (
                  <p className="status">
                    You are not signed in. Go back to the{' '}
                    <Link to="/">home page</Link> to sign in.
                  </p>
                ) : (
                  <div className="profile-grid">
                    <img
                      className="avatar"
                      src={user.picture}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                    />
                    <div className="profile-details">
                      <div className="field">
                        <span>Name</span>
                        <strong>{user.name}</strong>
                      </div>
                      <div className="field">
                        <span>Email</span>
                        <strong>{user.email}</strong>
                      </div>
                      <div className="field">
                        <span>Email verified</span>
                        <strong>{user.emailVerified ? 'Yes' : 'No'}</strong>
                      </div>
                      <div className="field">
                        <span>Locale</span>
                        <strong>{user.locale || 'Unknown'}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

export default App
