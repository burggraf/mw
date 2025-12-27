import { test, expect } from '@playwright/test'

test.describe('Media Library Bug Tests', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL!
    const password = process.env.TEST_PASSWORD!

    // Capture all console messages
    page.on('console', msg => {
      console.log(`[${msg.type().toUpperCase()}]`, msg.text())
    })

    // Login
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.locator('input[type="email"]').fill(email)
    await page.getByRole('button', { name: /email.*password/i }).click()
    await page.waitForTimeout(500)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(url => url.pathname !== '/login', { timeout: 15000 })

    // Navigate to media
    await page.goto('/media')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
  })

  test('debug: check media card structure', async ({ page }) => {
    // Take screenshot
    await page.screenshot({ path: 'test-results/media-cards.png', fullPage: true })

    // Log the HTML of media cards
    const cards = await page.locator('.aspect-video').all()
    console.log('Found cards:', cards.length)

    for (let i = 0; i < Math.min(cards.length, 2); i++) {
      const html = await cards[i].evaluate(el => el.outerHTML)
      console.log(`Card ${i}:`, html.substring(0, 500))
    }

    // Check for menu buttons
    const menuButtons = await page.locator('button:has(svg.lucide-more-horizontal)').all()
    console.log('Menu buttons found:', menuButtons.length)

    // Try to find any clickable elements
    const clickables = await page.locator('[role="button"], button').all()
    console.log('Clickable elements:', clickables.length)
  })

  test('bug: clicking thumbnail should open detail dialog', async ({ page }) => {
    // Wait for media to load
    await page.waitForTimeout(1000)

    // Find first media card
    const firstCard = page.locator('.aspect-video').first()
    await expect(firstCard).toBeVisible()

    // Click on it
    await firstCard.click()
    await page.waitForTimeout(500)

    // Check if dialog opened
    const dialog = page.getByRole('dialog')
    const isDialogVisible = await dialog.isVisible().catch(() => false)
    console.log('Dialog visible after click:', isDialogVisible)

    await page.screenshot({ path: 'test-results/after-thumbnail-click.png', fullPage: true })
  })

  test('bug: menu button should open dropdown', async ({ page }) => {
    // Wait for media to load
    await page.waitForTimeout(1000)

    // Find first media card and hover
    const firstCard = page.locator('.aspect-video').first()
    await firstCard.hover()
    await page.waitForTimeout(300)

    // Take screenshot after hover
    await page.screenshot({ path: 'test-results/after-hover.png', fullPage: true })

    // Find menu button
    const menuButton = page.locator('button:has(svg)').filter({ has: page.locator('.lucide-more-horizontal, [class*="MoreHorizontal"]') }).first()
    const menuButtonAlt = page.locator('[class*="MediaCard"] button').first()

    console.log('Menu button visible:', await menuButton.isVisible().catch(() => false))
    console.log('Alt menu button visible:', await menuButtonAlt.isVisible().catch(() => false))

    // Try clicking
    if (await menuButton.isVisible()) {
      await menuButton.click()
    } else if (await menuButtonAlt.isVisible()) {
      await menuButtonAlt.click()
    }

    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-results/after-menu-click.png', fullPage: true })

    // Check for dropdown
    const dropdown = page.locator('[role="menu"]')
    console.log('Dropdown visible:', await dropdown.isVisible().catch(() => false))
  })

  test('bug: stock media search should work', async ({ page }) => {
    // Open stock media dialog
    await page.getByRole('button', { name: /stock media/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Take screenshot
    await page.screenshot({ path: 'test-results/stock-dialog.png', fullPage: true })

    // Find search input in dialog
    const searchInputs = await page.locator('input').all()
    console.log('Inputs in dialog:', searchInputs.length)

    for (const input of searchInputs) {
      const placeholder = await input.getAttribute('placeholder')
      console.log('Input placeholder:', placeholder)
    }

    // Try to search
    const searchInput = page.getByRole('dialog').locator('input[type="text"]').first()
    await searchInput.fill('nature')

    // Find and click search button
    const searchButton = page.getByRole('dialog').getByRole('button', { name: /search/i })
    console.log('Search button visible:', await searchButton.isVisible().catch(() => false))

    if (await searchButton.isVisible()) {
      await searchButton.click()
      await page.waitForTimeout(3000)
      await page.screenshot({ path: 'test-results/after-stock-search.png', fullPage: true })
    }

    // Check for results or errors
    const results = await page.locator('[class*="grid"] img').count()
    console.log('Results found:', results)
  })
})
