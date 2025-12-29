import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getAppMode } from './platform'
import { ControllerApp } from './modes/controller'
import { DisplayApp } from './modes/display'
import './i18n'
import './index.css'

/**
 * Main entry point - routes to controller or display mode
 * based on the detected platform
 */
async function main() {
  const mode = await getAppMode()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {mode === 'controller' ? <ControllerApp /> : <DisplayApp />}
    </StrictMode>
  )
}

main()
