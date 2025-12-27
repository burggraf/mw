import { test, expect } from '@playwright/test'

test.describe('Media Library - Basic Tests', () => {
  test('should navigate to media page and check basic elements', async ({ page }) => {
    const email = process.env.TEST_EMAIL || 'test@example.com'
    const password = process.env.TEST_PASSWORD || 'testpassword'

    // Go to login page
    await page.goto('/login')
    
    // Login
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    
    // Wait for redirect (either to dashboard or church setup)
    await page.waitForTimeout(3000)
    
    // Try to navigate to media
    await page.goto('/media')
    
    // Wait for page to load
    await page.waitForTimeout(2000)
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/media-page.png', fullPage: true })
    
    // Check if we can see the page title
    const title = await page.textContent('h1')
    console.log('Page title:', title)
    
    // Check for errors in console
    const logs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text())
      }
    })
    
    await page.waitForTimeout(2000)
    
    if (logs.length > 0) {
      console.log('Console errors found:')
      logs.forEach(log => console.log('  -', log))
    }
  })
})
