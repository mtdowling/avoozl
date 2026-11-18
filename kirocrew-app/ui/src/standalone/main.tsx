import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppApiProvider } from '@kirocrew/app-sdk'
import Badge from '../ui/Badge'
import { Btn } from '../ui/Btn'
import { SegmentedControl } from '../ui/SegmentedControl'
import manifest from '../../../app.json'
import App from '../App.tsx'
import {
  applyTheme,
  clearNotice,
  installCsrf,
  navigate,
  notify,
  readTheme,
  saveTheme,
  signOut,
  useNotice,
  type ThemeChoice,
} from './host.ts'
import './app.css'

installCsrf()
applyTheme(readTheme())

const THEMES: { key: ThemeChoice; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
]

// The thin header: the Avoozl name, the notice area, the theme switch and
// Sign out. The workspace picker is the page's own.
function Header() {
  const [theme, setTheme] = useState(readTheme)
  const notice = useNotice()
  useEffect(() => {
    if (theme !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => applyTheme('system')
    query.addEventListener('change', follow)
    return () => query.removeEventListener('change', follow)
  }, [theme])
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-2">
      <strong>Avoozl</strong>
      <div className="min-w-0 flex-1">
        {notice ? (
          <button type="button" onClick={clearNotice} aria-label="Dismiss notice">
            <Badge variant={notice.type === 'error' ? 'danger' : notice.type === 'success' ? 'success' : undefined}>{notice.message}</Badge>
          </button>
        ) : null}
      </div>
      <SegmentedControl
        ariaLabel="Theme"
        layoutId="standalone-theme"
        collapse={false}
        segments={THEMES}
        value={theme}
        onChange={(key) => {
          setTheme(key)
          saveTheme(key)
        }}
      />
      <Btn onClick={() => void signOut()}>Sign out</Btn>
    </header>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppApiProvider
      appName={manifest.name}
      appDisplayName={manifest.displayName}
      appVersion={manifest.version}
      allowedApiPaths={manifest.permissions.api}
      navigateFn={navigate}
      notifyFn={notify}
      sessionKey="dashboard:ui"
    >
      <div className="flex h-screen flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-auto">
          <App />
        </main>
      </div>
    </AppApiProvider>
  </StrictMode>,
)
