import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/source-serif-4/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import App from './App'
import { pruneCache } from './api/cache'

// histórico salvo há mais de uma semana não é mais reaproveitado; libera o espaço
pruneCache(7 * 24 * 60 * 60_000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
