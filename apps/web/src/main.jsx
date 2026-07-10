import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { UiFlagProvider, readUiV2 } from './context/UiFlagContext.jsx'
import App from './App.jsx'
import './index.css'

// ui.v2 flag: stamp <html data-ui> BEFORE React mounts so the very first paint
// is already themed (no FOUC). readUiV2 resolves ?ui=v2|v1 (and persists it) →
// localStorage['finrep.ui'] → default v1. tokens.css keys every theme value
// off html[data-ui='v2'].
document.documentElement.dataset.ui = readUiV2() ? 'v2' : 'v1'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <UiFlagProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </UiFlagProvider>
    </BrowserRouter>
  </StrictMode>
)
