import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SharedArticle from './components/SharedArticle'
import { I18nProvider } from './i18n'
import './styles.css'

const shareMatch = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]{20,64})\/?$/)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      {shareMatch ? <SharedArticle shareId={shareMatch[1]} /> : <App />}
    </I18nProvider>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
