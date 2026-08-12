import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { installApiClient } from './apiClient.ts'
import './index.css'

const isHostedDesktopRenderer = window.location.hostname.toLowerCase() === 'web.seenary.app'
const isDesktopRuntime = Boolean(
  window.desktopUpdater &&
  window.desktopEnvironment &&
  window.desktopWindow
)

if (isHostedDesktopRenderer && !isDesktopRuntime) {
  window.location.replace('https://seenary.app')
} else {
  installApiClient()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
