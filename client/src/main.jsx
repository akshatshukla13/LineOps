import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const googleClientId =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '458009879224-ciuj4vh97871l06c0qp9gd811ga6c8ej.apps.googleusercontent.com'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GoogleOAuthProvider>
  </StrictMode>,
)
