import { test, expect } from '@playwright/test'

test('debug media page', async ({ page }) => {
  // Capture console messages
  const consoleMessages: Array<{type: string, text: string}> = []
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    })
  })

  // Capture page errors
  const pageErrors: string[] = []
  page.on('pageerror', error => {
    pageErrors.push(error.message)
  })

  const email = process.env.TEST_EMAIL!
  const password = process.env.TEST_PASSWORD!

  // Go to login
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  // Fill login form
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)

  // Click submit
  await page.locator('button[type="submit"]').click()

  // Wait for navigation
  await page.waitForURL(url => url.pathname !== '/login', { timeout: 10000 })

  console.log('After login, URL:', page.url())

  // Navigate to media
  await page.goto('/media')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Print all console messages
  console.log('\n=== CONSOLE MESSAGES ===')
  consoleMessages.forEach(msg => {
    if (msg.type === 'error' || msg.type === 'warning') {
      console.log(`[${msg.type.toUpperCase()}]`, msg.text)
    }
  })

  // Print page errors
  if (pageErrors.length > 0) {
    console.log('\n=== PAGE ERRORS ===')
    pageErrors.forEach(err => console.log(err))
  }

  // Take screenshot
  await page.screenshot({ path: 'test-results/media-debug.png', fullPage: true })

  // Check page content
  console.log('\n=== PAGE TITLE ===')
  const title = await page.title()
  console.log(title)

  // Check for h1
  const h1 = await page.locator('h1').first().textContent().catch(() => 'No h1 found')
  console.log('\n=== H1 TEXT ===')
  console.log(h1)
})
