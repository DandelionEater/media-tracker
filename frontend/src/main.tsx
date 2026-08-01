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
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <main className="flex min-h-screen items-center justify-center bg-[#0d0d0f] px-6 text-white">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/35">404</p>
        <h1 className="mt-3 text-2xl font-semibold">Not found</h1>
      </div>
    </main>,
  )
} else {
  installApiClient()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
