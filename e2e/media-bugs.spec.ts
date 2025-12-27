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

    // Find the media card container (the parent with group class)
    const cardContainer = page.locator('.group.relative.cursor-pointer').first()
    console.log('Card container visible:', await cardContainer.isVisible().catch(() => false))

    // Hover over the card to reveal the menu
    await cardContainer.hover()
    await page.waitForTimeout(500)

    // Take screenshot after hover
    await page.screenshot({ path: 'test-results/after-hover.png', fullPage: true })

    // Find the menu button within the card
    const menuButton = cardContainer.locator('button').first()
    console.log('Menu button count:', await cardContainer.locator('button').count())
    console.log('Menu button visible after hover:', await menuButton.isVisible().catch(() => false))

    // Force show the button by removing opacity-0 class
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('.group button')
      buttons.forEach(btn => {
        (btn as HTMLElement).style.opacity = '1'
      })
    })
    await page.waitForTimeout(200)

    // Try clicking the button
    if (await menuButton.isVisible()) {
      await menuButton.click()
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: 'test-results/after-menu-click.png', fullPage: true })

    // Check for dropdown menu
    const dropdown = page.locator('[role="menu"]')
    console.log('Dropdown visible:', await dropdown.isVisible().catch(() => false))
  })

  test('bug: stock media search should work', async ({ page }) => {
    // Open stock media dialog
    await page.getByRole('button', { name: /stock media/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(500)

    // Take screenshot
    await page.screenshot({ path: 'test-results/stock-dialog.png', fullPage: true })

    // Find search input by placeholder (inside dialog)
    const searchInput = page.getByRole('dialog').getByPlaceholder(/search for/i)
    await expect(searchInput).toBeVisible()
    console.log('Search input found')

    // Search for winter
    await searchInput.fill('winter')
    console.log('Filled search input with "winter"')

    // Click search button
    const searchButton = page.getByRole('dialog').getByRole('button', { name: /search/i })
    await expect(searchButton).toBeVisible()
    await searchButton.click()
    console.log('Clicked search button')

    // Wait for results
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'test-results/after-stock-search.png', fullPage: true })

    // Check for results or errors
    const dialog = page.getByRole('dialog')
    const images = await dialog.locator('img').count()
    console.log('Images found in dialog:', images)

    // Check for any error toasts
    const errorToast = page.locator('[data-sonner-toast][data-type="error"]')
    const hasError = await errorToast.isVisible().catch(() => false)
    console.log('Has error toast:', hasError)

    // Expect at least some results
    expect(images).toBeGreaterThan(0)
  })
})
